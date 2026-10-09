/** Persistent JavaScript evaluation in a DSH-confined subprocess, never in the Host. */
import { start } from 'node:repl'
import { PassThrough, Writable } from 'node:stream'
import { AsyncLocalStorage } from 'node:async_hooks'
import { inspect } from 'node:util'
import type { EventEmitter } from 'node:events'
import { openInheritedControlChannel } from '@deepseek-ai/dsh-subprocess/control'
import { ReplChannel } from './repl-channel.ts'
import { errorText } from './errors.ts'
import type { BrowserAction, NativeAction, Result } from './protocol.ts'

const control = openInheritedControlChannel()
for (const key of Object.keys(process.env)) delete process.env[key]
const run = new AsyncLocalStorage<string>()
let active: string | undefined
let sequence = 0
const pending = new Map<number, { resolve: (result: Result) => void; reject: (error: Error) => void; promise: Promise<Result> }>()
const channel = new ReplChannel(control, message => {
  const m = message as { type?: string; id?: string; code?: string; seq?: number; result?: Result; error?: string }
  if (m.type === 'reply' && typeof m.seq === 'number') {
    const call = pending.get(m.seq)
    if (!call) return
    pending.delete(m.seq)
    if (m.error) call.reject(new Error(m.error))
    else if (m.result) call.resolve(m.result)
    else call.reject(new Error('Missing Computer Use result'))
  } else if (m.type === 'eval' && typeof m.id === 'string' && typeof m.code === 'string' && !active) {
    void evaluate(m.id, m.code).catch(() => process.exit(1))
  } else process.exit(1)
}, () => process.exit(1))
function output(value: unknown): void {
  if (!active || run.getStore() !== active) throw new Error('Output requires an active cua_repl call')
  channel.send({ type: 'output', id: active, content: { type: 'text', text: typeof value === 'string' ? value : inspect(value, { depth: 6, maxArrayLength: 100, maxStringLength: 32768 }) } })
}
async function call(surface: 'native' | 'browser', operation: NativeAction | BrowserAction): Promise<Result> {
  if (!active || run.getStore() !== active) throw new Error('Computer Use calls must belong to the active evaluation')
  if (pending.size >= 16) throw new Error('At most 16 pending Computer Use calls are allowed')
  const seq = ++sequence
  const deferred = Promise.withResolvers<Result>()
  pending.set(seq, deferred)
  // A forgotten await must neither become an unhandled rejection nor outlive evaluation cleanup.
  void deferred.promise.catch(() => {})
  channel.send({ type: 'call', id: active, seq, command: { surface, operation } })
  return deferred.promise
}
async function data(surface: 'native' | 'browser', operation: NativeAction | BrowserAction) {
  const result = await call(surface, operation)
  if (result.isError) throw new Error(result.content.filter(x => x.type === 'text').map(x => x.text).join('\n'))
  return result.structuredContent ?? result
}
function tab(target: string) {
  return Object.freeze({ id: target,
    getState: (options: { screenshot?: boolean } = {}) => data('browser', { action: 'observe', target, screenshot: options.screenshot ?? false }),
    navigate: (url: string) => data('browser', { action: 'navigate', target, url }),
    click: (ref: string) => data('browser', { action: 'click', target, ref }),
    fill: (ref: string, text: string) => data('browser', { action: 'fill', target, ref, text }),
    press: (key: Extract<BrowserAction, { action: 'press' }>['key']) => data('browser', { action: 'press', target, key }),
    scroll: (y: number, x = 0) => data('browser', { action: 'scroll', target, x, y }),
    close: () => data('browser', { action: 'close', target }),
  })
}
const cua = Object.freeze({
  native: (operation: NativeAction) => call('native', operation),
  browser: (operation: BrowserAction) => call('browser', operation),
  getState: () => data('native', { action: 'apps' }),
  listWindows: (pid: number) => data('native', { action: 'windows', pid }),
  async getApp(options: { pid: number; windowId: number }) {
    const state = await data('native', { action: 'select', ...options }) as { target: string }
    const target = state.target
    output(state)
    return Object.freeze({ id: target,
      getState: (options: { screenshot?: boolean } = {}) => call('native', { action: 'observe', target, screenshot: options.screenshot ?? false }),
      act: (tool: Extract<NativeAction, { action: 'act' }>['tool'], args: Extract<NativeAction, { action: 'act' }>['args']) => data('native', { action: 'act', target, tool, args }),
      close: () => data('native', { action: 'close', target }),
    })
  },
  async createBrowserTab(url: string) {
    const state = await data('browser', { action: 'open', url, visible: true }) as { target: string }
    output(state)
    return tab(state.target)
  },
  getTab: (target: string) => tab(target),
})
const input = new PassThrough()
const repl = start({ input, output: new Writable({ write(_chunk, _encoding, done) { done() } }), terminal: false, prompt: '', useGlobal: false, ignoreUndefined: true })
// Node's built-in evaluator routes synchronous throws to its domain, not its callback.
// This Node 22/24 adapter is covered by process-level tests; fail closed on an incompatible runtime.
const evaluationDomain = (() => {
  const domain = (repl as typeof repl & { _domain?: EventEmitter })._domain
  if (!domain) throw new Error('This Node REPL version does not expose the required error channel')
  return domain
})()
Object.assign(repl.context, { cua, nodeRepl: Object.freeze({ write: output, emitImage: (value: { data: string; mimeType: string }) => {
  if (!active || run.getStore() !== active) throw new Error('Images require an active evaluation')
  channel.send({ type: 'output', id: active, content: { type: 'image', data: value.data, mimeType: value.mimeType } })
} }), console: Object.freeze({ log: (...values: unknown[]) => output(values.map(v => typeof v === 'string' ? v : inspect(v)).join(' ')), error: output, warn: output }) })

async function evaluate(id: string, code: string): Promise<void> {
  active = id
  let failure: unknown
  let value: unknown
  await run.run(id, () => new Promise<void>(resolve => {
    // The built-in REPL supplies top-level await and lexical persistence. OS confinement is the boundary.
    const onError = (error: Error) => { if (run.getStore() === id) done(error, undefined) }
    const done = (error: Error | null, result: unknown) => { evaluationDomain.removeListener('error', onError); failure = error; value = result; resolve() }
    evaluationDomain.on('error', onError)
    repl.eval(code + '\n', repl.context, 'cua_repl', done)
  }))
  // Close capability admission before draining previously admitted operations.
  active = undefined
  await Promise.allSettled([...pending.values()].map(item => item.promise))
  channel.send({ type: 'done', id, ...(failure ? { error: errorText(failure) } : { value: value === undefined ? undefined : inspect(value, { depth: 5, maxArrayLength: 100, maxStringLength: 32768 }) }) })
}
channel.send({ type: 'ready' })
