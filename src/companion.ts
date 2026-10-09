/** The Host plugin owns a separate Electron child; it never sends IPC to DSH's parent. */
import { spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { DesktopTransport } from './transport.ts'
import { companionEnvironment, ELECTRON_VERSION, resolveElectron, runtimeDirectory, type RuntimeOptions } from './runtime.ts'
import { errorText } from './errors.ts'
import type { Request, Result } from './protocol.ts'

export interface CompanionOptions extends RuntimeOptions { startupTimeoutMs: number; timeoutMs: number }
export class Companion {
  private starting?: Promise<DesktopTransport>
  private transport?: DesktopTransport
  private child?: ChildProcess
  private exited?: Promise<void>
  private profile?: string
  private lifetime = new AbortController()
  private disposing?: Promise<void>
  constructor(private options: CompanionOptions, private log: (text: string) => void = () => {}) {}
  get running(): boolean { return !!this.child?.connected && !this.lifetime.signal.aborted }
  async call(owner: string, operation: Request['operation'], signal: AbortSignal): Promise<Result> {
    signal.throwIfAborted()
    this.lifetime.signal.throwIfAborted()
    this.starting ??= this.launch(AbortSignal.any([signal, this.lifetime.signal, AbortSignal.timeout(this.options.startupTimeoutMs)]))
    const transport = await this.starting
    signal.throwIfAborted()
    return transport.call(owner, operation, signal)
  }
  private async launch(signal: AbortSignal): Promise<DesktopTransport> {
    try {
      const executable = await resolveElectron(this.options, signal, this.log)
      signal.throwIfAborted()
      const sessions = join(runtimeDirectory(this.options), 'sessions')
      await mkdir(sessions, { recursive: true })
      this.profile = await mkdtemp(join(sessions, 'session-'))
      signal.throwIfAborted()
      const child = this.child = spawn(executable, [fileURLToPath(new URL('./companion-main.js', import.meta.url)), this.profile], {
        env: companionEnvironment(process.env), stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      })
      let diagnostic = ''
      child.stderr?.setEncoding('utf8')
      child.stderr?.on('data', (chunk: string) => { diagnostic = (diagnostic + chunk).slice(-4096) })
      this.exited = new Promise(resolve => child.once('close', () => resolve()))
      // The transport is attached before readiness, so early failure rejects every pending call.
      this.transport = new DesktopTransport(child, this.options.timeoutMs + 3000)
      await new Promise<void>((resolve, reject) => {
        const abort = () => finish(new Error('Computer Use startup canceled or timed out'))
        const close = () => finish(new Error(`Computer Use companion exited during startup. ${diagnostic.trim()}`))
        const error = (cause: Error) => finish(cause)
        const message = (value: unknown) => {
          if (!value || typeof value !== 'object' || !('type' in value)) return
          if (value.type === 'dsh-cua/fatal' && 'message' in value && typeof value.message === 'string') finish(new Error(value.message))
          if (value.type === 'dsh-cua/ready') {
            if (!('version' in value) || value.version !== 1 || !('electron' in value) || value.electron !== ELECTRON_VERSION) finish(new Error(`Companion requires Electron ${ELECTRON_VERSION}`))
            else finish()
          }
        }
        const finish = (cause?: Error) => {
          signal.removeEventListener('abort', abort)
          child.off('close', close); child.off('error', error); child.off('message', message)
          cause ? reject(cause) : resolve()
        }
        child.once('close', close); child.once('error', error); child.on('message', message)
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
      })
      // Contain late channel errors without an uncaught EventEmitter error.
      child.on('error', error => { this.log(`Computer Use companion: ${error.message}`); this.transport?.close() })
      return this.transport
    } catch (error) {
      await this.stopChild()
      throw new Error(`Computer Use startup failed: ${errorText(error)}`, { cause: error })
    }
  }
  private async stopChild(): Promise<void> {
    this.transport?.close()
    const child = this.child
    if (child) {
      if (child.connected) child.send({ type: 'dsh-cua/shutdown', version: 1 }, () => {})
      const wait = async (ms: number) => {
        let timer: ReturnType<typeof setTimeout> | undefined
        try { return await Promise.race([this.exited!.then(() => true), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), ms) })]) }
        finally { clearTimeout(timer) }
      }
      if (!await wait(8000)) { child.kill('SIGTERM'); if (!await wait(2000)) { child.kill('SIGKILL'); if (!await wait(2000)) throw new Error('Companion failed to exit') } }
      this.child = undefined
    }
    if (this.profile) { await rm(this.profile, { recursive: true, force: true }); this.profile = undefined }
  }
  dispose(): Promise<void> {
    if (this.disposing) return this.disposing
    this.lifetime.abort(new Error('Computer Use unloaded'))
    this.disposing = (async () => {
      await this.starting?.catch(() => {})
      await this.stopChild()
    })()
    return this.disposing
  }
}
