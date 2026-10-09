import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import type {} from '@deepseek-ai/dsh-fs'
import { z } from 'zod'
import { commandSchema, resultSchema, type Command, type Result } from './protocol.ts'
import { errorText } from './errors.ts'
import { ReplChannel, MAX_FRAME } from './repl-channel.ts'

const workerMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('call'), id: z.string().uuid(), seq: z.number().int().positive(), command: commandSchema }),
  z.object({ type: z.literal('output'), id: z.string().uuid(), content: resultSchema.shape.content.element }),
  z.object({ type: z.literal('done'), id: z.string().uuid(), error: z.string().optional(), value: z.string().optional() }),
])
interface Evaluation {
  id: string; signal: AbortSignal; calls: Set<Promise<void>>; seen: Set<number>
  accepting: boolean
  content: Result['content']; bytes: number
  resolve: (result: Result) => void; reject: (error: Error) => void
}

/** One persistent interpreter; every admission remains within the outer approved tool call. */
export class ReplHost {
  private child?: SubprocessHandle
  private channel?: ReplChannel
  private active?: Evaluation
  private lifetime = new AbortController()
  private ready = Promise.withResolvers<void>()
  private started?: Promise<void>
  private closing?: Promise<void>
  private stderr = ''
  constructor(private ctx: Pick<Context, 'subprocess' | 'sandbox' | 'fs'>, readonly policy: SandboxExecutionPolicy,
    private dispatch: (command: Command, signal: AbortSignal) => Promise<Result>, private workerPath = fileURLToPath(new URL('./repl-worker.js', import.meta.url))) {
    void this.ready.promise.catch(() => {})
  }
  get closed(): boolean { return this.lifetime.signal.aborted }
  async evaluate(code: string, signal: AbortSignal): Promise<Result> {
    signal.throwIfAborted()
    if (this.closed) throw new Error('REPL was reset; start a new call')
    if (this.active) throw new Error('Another cua_repl evaluation is still running')
    const combined = AbortSignal.any([signal, this.lifetime.signal])
    const abort = () => { void this.dispose(new Error(`REPL canceled or timed out: ${errorText(combined.reason)}. Variables and target bindings were reset.`)) }
    combined.addEventListener('abort', abort, { once: true })
    const completion = Promise.withResolvers<Result>()
    void completion.promise.catch(() => {})
    const state: Evaluation = { id: randomUUID(), signal: combined, calls: new Set(), seen: new Set(), accepting: true, content: [], bytes: 0, ...completion }
    this.active = state
    try {
      this.started ??= this.start(combined)
      await this.started
      combined.throwIfAborted()
      this.channel!.send({ type: 'eval', id: state.id, code })
      return await completion.promise
    } catch (error) {
      await this.dispose(error instanceof Error ? error : new Error(errorText(error)))
      throw new Error(errorText(error))
    } finally {
      combined.removeEventListener('abort', abort)
      await Promise.allSettled([...state.calls])
      if (this.active === state) this.active = undefined
    }
  }
  private async start(signal: AbortSignal): Promise<void> {
    const worker = this.ctx.fs.processPathFromHostPath(this.workerPath)
    if (!worker) throw new Error('cua_repl requires a local DSH filesystem and subprocess provider')
    const executable = await this.ctx.subprocess.resolveExecutable(process.execPath, undefined, signal)
    const argv = [executable, '--max-old-space-size=256', worker]
    const confined = this.policy.mode === 'danger-full-access' ? undefined : await this.ctx.sandbox.confine(argv, { ...this.policy, mode: this.policy.mode }, signal)
    signal.throwIfAborted()
    const retain = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP'])
    const env: NodeJS.ProcessEnv = Object.fromEntries(Object.keys(process.env).filter(key => !retain.has(key.toUpperCase())).map(key => [key, undefined]))
    if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1'
    this.child = this.ctx.subprocess.spawn({ argv: confined?.argv ?? argv, cwd: this.policy.workspaceRoot, env,
      stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', control: 'pipe' }, graceMs: 1000, signal: this.lifetime.signal })
    if (!this.child.control) throw new Error('DSH subprocess provider did not supply a control pipe')
    this.channel = new ReplChannel(this.child.control, value => this.receive(value), error => {
      // stderr can arrive in the same event-loop turn as the descriptor closes.
      setImmediate(() => { void this.dispose(new Error(`${error.message}${this.stderr ? `: ${this.stderr}` : ''}`)) })
    })
    for (const stream of [this.child.stdout, this.child.stderr]) stream?.on('data', (part: Buffer) => {
      if (stream === this.child?.stderr) this.stderr = (this.stderr + part.toString('utf8')).slice(-8192)
      const state = this.active
      if (!state) return
      this.admit(state, { type: 'text', text: part.toString('utf8') })
    })
    void this.child.done.then(outcome => this.dispose(new Error(`REPL process exited (${outcome.exitCode ?? outcome.signal}); variables were reset${this.stderr ? `: ${this.stderr}` : ''}`)), error => this.dispose(new Error(errorText(error))))
    await this.ready.promise
  }
  private admit(state: Evaluation, content: Result['content'][number]): void {
    state.bytes += Buffer.byteLength(JSON.stringify(content))
    if (state.bytes > MAX_FRAME) { void this.dispose(new Error('REPL output exceeds 4 MiB; variables were reset')); return }
    state.content.push(content)
  }
  private receive(value: unknown): void {
    const parsed = workerMessage.safeParse(value)
    if (!parsed.success) { void this.dispose(new Error('Invalid REPL worker message')); return }
    const message = parsed.data
    if (message.type === 'ready') { this.ready.resolve(); return }
    const state = this.active
    if (!state || !state.accepting || message.id !== state.id || state.signal.aborted) return
    if (message.type === 'output') this.admit(state, message.content)
    else if (message.type === 'done') {
      state.accepting = false
      const text = message.error ?? message.value
      if (text) this.admit(state, { type: 'text', text })
      state.resolve({ content: state.content.length ? state.content : [{ type: 'text', text: 'Evaluation complete.' }], ...(message.error ? { isError: true } : {}) })
    } else {
      if (state.calls.size >= 16 || state.seen.has(message.seq) || state.seen.size >= 256) { void this.dispose(new Error('REPL capability call limit exceeded')); return }
      state.seen.add(message.seq)
      const task = this.dispatch(message.command, state.signal).then(result => {
        if (!state.signal.aborted) this.channel?.send({ type: 'reply', seq: message.seq, result: resultSchema.parse(result) })
      }, error => {
        if (!state.signal.aborted) this.channel?.send({ type: 'reply', seq: message.seq, error: errorText(error) })
      }).catch(error => { void this.dispose(new Error(errorText(error))) })
      state.calls.add(task)
      void task.finally(() => state.calls.delete(task))
    }
  }
  dispose(reason = new Error('REPL reset')): Promise<void> {
    if (this.closing) return this.closing
    // Set the idempotence latch before abort callbacks can re-enter disposal.
    const completion = Promise.withResolvers<void>()
    this.closing = completion.promise
    this.ready.reject(reason)
    this.active?.reject(reason)
    this.lifetime.abort(reason)
    this.channel?.close()
    this.child?.terminate()
    void (async () => {
      if (this.child) {
        await this.child.waitForExit(AbortSignal.timeout(5000)).catch(() => false)
      }
    })().then(completion.resolve, completion.reject)
    return this.closing
  }
}
