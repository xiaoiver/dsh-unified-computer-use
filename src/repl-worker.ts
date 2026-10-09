/** Persistent JavaScript evaluation in a DSH-confined subprocess, never in the Host. */
import { start } from 'node:repl'
import { PassThrough, Writable } from 'node:stream'
import { AsyncLocalStorage } from 'node:async_hooks'
import { inspect } from 'node:util'
import type { EventEmitter } from 'node:events'
import { openInheritedControlChannel } from '@deepseek-ai/dsh-subprocess/control'
import { ReplChannel } from './repl-channel.ts'
import { errorText } from './errors.ts'
import { replInstructions, browserReplInstructions } from './repl-documentation.ts'
import { createPlaywrightFacade } from './playwright-facade.ts'
import type { BrowserAction, NativeAction, Result } from './protocol.ts'

const control = openInheritedControlChannel()
for (const key of Object.keys(process.env)) delete process.env[key]
const run = new AsyncLocalStorage<string>()
let active: string | undefined
let sequence = 0
let commonIntroduced = false
let browserIntroduced = false
let documentsInCell = new Set<string>()
let quietValues = new WeakSet<object>()
function current(): boolean { return !!active && run.getStore() === active }
function requireCurrent(): void { if (!current()) throw new Error('Documentation requires an active cua_repl call') }
function displayDocument(document: string): void {
  requireCurrent()
  if (documentsInCell.has(document)) return
  output(document); documentsInCell.add(document)
}
function introduceBrowser(): void {
  // Detached continuations must not change documentation state or emit into another cell.
  if (!current() || browserIntroduced) return
  displayDocument(browserReplInstructions); browserIntroduced = true
}
function quiet<T>(value: T): T {
  if (current() && typeof value === 'object' && value !== null) quietValues.add(value)
  return value
}
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
function structured(response: Result) {
  if (response.isError) throw new Error(response.content.filter(x => x.type === 'text').map(x => x.text).join('\n'))
  return response.structuredContent ?? response
}
async function data(surface: 'native' | 'browser', operation: NativeAction | BrowserAction) {
  return structured(await call(surface, operation))
}
type ObservationOptions = { screenshot?: boolean; emit?: boolean }
async function observe(surface: 'native' | 'browser', operation: NativeAction | BrowserAction, emit = true, binding = false) {
  const response = await call(surface, operation)
  const state = structured(response)
  if (binding && surface === 'browser') introduceBrowser()
  if (current() && emit) {
    // Emit structured state once, then forward actual image blocks without stringifying them.
    if (response.structuredContent) output(response.structuredContent)
    for (const content of response.content) {
      if (content.type === 'text') { if (!response.structuredContent) output(content.text) }
      else channel.send({ type: 'output', id: active!, content })
    }
  }
  return quiet(state)
}
function tab(target: string) {
  const playwright = createPlaywrightFacade(target, operation => call('browser', operation))
  return quiet(Object.freeze({ id: target, playwright,
    documentation: async () => { requireCurrent(); return browserReplInstructions },
    getState: (options: ObservationOptions = {}) => observe('browser', { action: 'observe', target, screenshot: options.screenshot ?? false }, options.emit ?? true),
    goto: (url: string) => playwright.goto(url),
    back: () => playwright.back(), forward: () => playwright.forward(), reload: () => playwright.reload(),
    close: () => data('browser', { action: 'close', target }),
  }))
}
const cua = Object.freeze({
  documentation: async () => { requireCurrent(); return replInstructions },
  rewriteDocumentation: async () => {
    displayDocument(replInstructions)
    if (browserIntroduced) displayDocument(browserReplInstructions)
  },
  native: (operation: NativeAction) => call('native', operation),
  browser: async (operation: BrowserAction) => {
    const response = await call('browser', operation)
    if (!response.isError) introduceBrowser()
    return response
  },
  getState: (options: { emit?: boolean } = {}) => observe('native', { action: 'apps' }, options.emit ?? true),
  listWindows: (pid: number, options: { emit?: boolean } = {}) => observe('native', { action: 'windows', pid }, options.emit ?? true),
  async getApp(options: { pid: number; windowId: number }) {
    const state = await observe('native', { action: 'select', ...options }) as { target: string }
    const target = state.target
    return quiet(Object.freeze({ id: target,
      getState: (options: ObservationOptions = {}) => observe('native', { action: 'observe', target, screenshot: options.screenshot ?? false }, options.emit ?? true),
      act: (tool: Extract<NativeAction, { action: 'act' }>['tool'], args: Extract<NativeAction, { action: 'act' }>['args']) => data('native', { action: 'act', target, tool, args }),
      close: () => data('native', { action: 'close', target }),
    }))
  },
  async getBrowser() {
    await data('browser', { action: 'prepare' }); introduceBrowser()
    return quiet(Object.freeze({ browserId: 'chrome', documentation: async () => { requireCurrent(); return browserReplInstructions } }))
  },
  listTabs: (options: { emit?: boolean } = {}) => observe('browser', { action: 'list' }, options.emit ?? true, true),
  async createBrowserTab(url: string) {
    const state = await observe('browser', { action: 'open', url }, true, true) as { target: string }
    return tab(state.target)
  },
  async getTab(target: string) {
    const state = await observe('browser', { action: 'observe', target, screenshot: false }, true, true) as { target: string }
    return tab(state.target)
  },
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
Object.assign(repl.context, { cua, nodeRepl: Object.freeze({ write: output, emitImage: (image: { data: string; mimeType: string } | Uint8Array) => {
  const value = ArrayBuffer.isView(image) && Object.prototype.toString.call(image) === '[object Uint8Array]' ? {data:Buffer.from(image as Uint8Array).toString('base64'),mimeType:'image/png'} : image as { data: string; mimeType: string }
  if (!active || run.getStore() !== active) throw new Error('Images require an active evaluation')
  channel.send({ type: 'output', id: active, content: { type: 'image', data: value.data, mimeType: value.mimeType } })
} }), console: Object.freeze({ log: (...values: unknown[]) => output(values.map(v => typeof v === 'string' ? v : inspect(v)).join(' ')), error: output, warn: output }) })

async function evaluate(id: string, code: string): Promise<void> {
  active = id
  documentsInCell = new Set()
  quietValues = new WeakSet()
  let failure: unknown
  let value: unknown
  await run.run(id, () => new Promise<void>(resolve => {
    if (!commonIntroduced) { displayDocument(replInstructions); commonIntroduced = true }
    // The built-in REPL supplies top-level await and lexical persistence. OS confinement is the boundary.
    const onError = (error: Error) => { if (run.getStore() === id) done(error, undefined) }
    const done = (error: Error | null, result: unknown) => { evaluationDomain.removeListener('error', onError); failure = error; value = result; resolve() }
    evaluationDomain.on('error', onError)
    repl.eval(code + '\n', repl.context, 'cua_repl', done)
  }))
  // Close capability admission before draining previously admitted operations.
  active = undefined
  await Promise.allSettled([...pending.values()].map(item => item.promise))
  channel.send({ type: 'done', id, ...(failure ? { error: errorText(failure) } : { value: value === undefined || (typeof value === 'object' && value !== null && quietValues.has(value)) ? undefined : inspect(value, { depth: 5, maxArrayLength: 100, maxStringLength: 32768 }) }) })
}
channel.send({ type: 'ready' })
