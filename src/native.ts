/** Cua Driver operations scoped to exact discovered process/window pairs. */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { result, resultSchema, type NativeAction, type Result } from './protocol.ts'
import type { CuaDriverLike } from '@trycua/cua-driver'
import { requireNativePermissions } from './permissions-native.ts'

export interface DriverPort { call(name: string, args: object, signal: AbortSignal): Promise<Result> }

/** Load native libraries only when a native tool is used; browser-only use needs none. */
export class NativeRuntime implements DriverPort {
  private driver?: Promise<CuaDriverLike>
  private closed = false
  private disposing?: Promise<void>
  private calls = new Set<Promise<Result>>()
  call(name: string, args: object, signal: AbortSignal): Promise<Result> {
    const task = this.execute(name, args, signal)
    this.calls.add(task)
    void task.finally(() => this.calls.delete(task)).catch(() => {})
    return task
  }
  private async execute(name: string, args: object, signal: AbortSignal): Promise<Result> {
    signal.throwIfAborted()
    if (this.closed) throw new Error('Native runtime is closed')
    if (process.platform === 'darwin' && name !== 'check_permissions' && name !== 'end_session') {
      const sdk = await import('@trycua/cua-driver')
      signal.throwIfAborted()
      requireNativePermissions(name, args, sdk.currentMacOsPermissionStatus())
    }
    this.driver ??= import('@trycua/cua-driver').then(({ CuaDriver }) => CuaDriver.create({ claudeCodeCompatibility: false }))
    const driver = await this.driver
    signal.throwIfAborted()
    const reply = await driver.callTool(name, JSON.stringify(args), { signal })
    signal.throwIfAborted()
    return resultSchema.parse(JSON.parse(reply.rawJson))
  }
  dispose(): Promise<void> {
    if (this.disposing) return this.disposing
    this.closed = true
    this.disposing = (async () => {
      await Promise.allSettled(this.calls)
      if (!this.driver) return
      const driver = await this.driver
      await driver.shutdown()
      if ('uniffiDestroy' in driver && typeof driver.uniffiDestroy === 'function') driver.uniffiDestroy()
    })()
    return this.disposing
  }
}

const appsSchema = z.object({ apps: z.array(z.object({ pid: z.number(), name: z.string(), bundle_id: z.string().nullable().optional() })) })
const windowsSchema = z.object({ windows: z.array(z.object({ window_id: z.number(), pid: z.number().nullable(), title: z.string(), layer: z.number().nullable().optional() })) })
interface Target {
  id: string; pid: number; windowId: number; bundle: string
  valid: boolean; observed: boolean; screenshot: boolean; tokens: Set<string>; secureTokens: Set<string>
}
const argumentKeys = new Set(['element_token', 'x', 'y', 'button', 'count', 'action', 'value', 'text', 'key', 'keys', 'modifiers', 'direction', 'by', 'amount', 'from_x', 'from_y', 'to_x', 'to_y', 'duration_ms', 'steps', 'modifier'])
function data(response: Result) {
  if (response.isError) throw new Error(response.content.filter(c => c.type === 'text').map(c => c.text).join('\n'))
  if (!response.structuredContent) throw new Error('Native driver returned no structured state')
  return response.structuredContent
}

/** Own exact native targets and their current observation tokens. */
export class NativeSurface {
  private targets = new Map<string, Target>()
  private session = `dsh-${randomUUID()}`
  private lifetime = new AbortController()
  private used = false
  private timer?: ReturnType<typeof setInterval>
  private checking?: Promise<void>
  private disposing?: Promise<void>
  constructor(private driver: DriverPort, private maxTargets: () => number) {}

  async execute(op: NativeAction, signal: AbortSignal): Promise<Result> {
    signal = AbortSignal.any([signal, this.lifetime.signal])
    signal.throwIfAborted()
    if (op.action === 'permissions') return this.call('check_permissions', { prompt: false }, signal)
    if (op.action === 'apps') return this.call('list_apps', {}, signal)
    if (op.action === 'windows') return this.call('list_windows', { pid: op.pid, on_screen_only: false }, signal)
    if (op.action === 'select') {
      const existing = [...this.targets.values()].find(t => t.pid === op.pid && t.windowId === op.windowId && t.valid)
      if (existing) return this.observe(existing, false, signal)
      if (this.targets.size >= this.maxTargets()) throw new Error('Close a native target before selecting another')
      const apps = appsSchema.parse(data(await this.call('list_apps', {}, signal))).apps
      const app = apps.find(a => a.pid === op.pid)
      if (!app) throw new Error('Process is not a discovered application')
      const selected: Target = { id: randomUUID(), pid: op.pid, windowId: op.windowId, bundle: app.bundle_id ?? app.name,
        valid: true, observed: false, screenshot: false, tokens: new Set(), secureTokens: new Set() }
      await this.verify(selected, signal)
      signal.throwIfAborted()
      this.targets.set(selected.id, selected)
      this.startMonitor()
      return this.observe(selected, false, signal)
    }
    const selected = this.targets.get(op.target)
    if (!selected || !selected.valid) throw new Error('Native target is closed or belongs to another session')
    if (op.action === 'close') { this.remove(selected); return result({ closed: selected.id }) }
    await this.verify(selected, signal)
    if (op.action === 'observe') return this.observe(selected, op.screenshot, signal)
    if (op.action === 'reveal') return this.call('bring_to_front', { pid: selected.pid, window_id: selected.windowId }, signal)
    if (!selected.observed) throw new Error('Observe the native window before each action')
    for (const key of Object.keys(op.args)) if (!argumentKeys.has(key)) throw new Error(`Unsupported native argument: ${key}`)
    if (JSON.stringify(op.args).length > 40_000) throw new Error('Native input is too large')
    const token = op.args.element_token
    if (token !== undefined && (typeof token !== 'string' || !selected.tokens.has(token))) throw new Error('Element token is not in this target observation')
    if (typeof token === 'string' && selected.secureTokens.has(token)) throw new Error('Enter passwords manually in the application')
    if (['x', 'y', 'from_x', 'from_y', 'to_x', 'to_y'].some(key => key in op.args) && !selected.screenshot) throw new Error('Coordinate actions require an explicit screenshot observation')
    selected.observed = false
    const response = await this.call(op.tool, {
      ...op.args, pid: selected.pid, window_id: selected.windowId,
      ...(op.tool === 'set_value' ? {} : { delivery_mode: 'background' }),
    }, signal)
    return response
  }
  private async observe(target: Target, screenshot: boolean, signal: AbortSignal): Promise<Result> {
    target.observed = false
    target.tokens.clear(); target.secureTokens.clear()
    const reply = await this.call('get_window_state', { pid: target.pid, window_id: target.windowId, include_screenshot: screenshot, include_accessibility_tree: true, max_elements: 500, max_depth: 25, max_dimension: 1280 }, signal)
    const state = z.object({ pid: z.number(), window_id: z.number(), elements: z.array(z.object({ element_token: z.string().nullable().optional(), role: z.string(), subrole: z.string().nullable().optional() }).passthrough()) }).passthrough().parse(data(reply))
    if (state.pid !== target.pid || state.window_id !== target.windowId) throw new Error('Native observation returned a different window')
    await this.verify(target, signal)
    for (const element of state.elements) {
      if (element.element_token) {
        target.tokens.add(element.element_token)
        if (/password|secure/i.test(`${element.role} ${element.subrole ?? ''}`)) target.secureTokens.add(element.element_token)
      }
    }
    target.observed = true
    target.screenshot = screenshot && reply.content.some(c => c.type === 'image')
    const structured = { ...data(reply), target: target.id }
    return { ...reply, structuredContent: structured, content: [{ type: 'text', text: JSON.stringify(structured) }, ...reply.content.filter(c => c.type === 'image' && screenshot)] }
  }
  private async call(name: string, args: object, signal: AbortSignal): Promise<Result> {
    this.used = true
    return this.driver.call(name, { ...args, session: this.session }, signal)
  }
  private async verify(target: Target, signal: AbortSignal): Promise<void> {
    const apps = appsSchema.parse(data(await this.call('list_apps', {}, signal))).apps
    const windows = windowsSchema.parse(data(await this.call('list_windows', { pid: target.pid, on_screen_only: false }, signal))).windows
    const app = apps.find(a => a.pid === target.pid && (a.bundle_id ?? a.name) === target.bundle)
    const window = windows.find(w => w.pid === target.pid && w.window_id === target.windowId && (w.layer === 0 || w.layer == null))
    if (!app || !window) { this.remove(target); throw new Error('Native process/window identity changed') }
  }
  private startMonitor(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      if (this.checking || this.lifetime.signal.aborted) return
      this.checking = Promise.allSettled([...this.targets.values()].map(t => this.verify(t, this.lifetime.signal).catch(() => this.remove(t)))).then(() => {}).finally(() => { this.checking = undefined })
    }, 2000)
    this.timer.unref()
  }
  private remove(target: Target): void { target.valid = false; target.observed = false; this.targets.delete(target.id) }
  invalidateAll(): void { for (const target of this.targets.values()) { target.observed = false; target.tokens.clear() } }
  dispose(): Promise<void> {
    if (this.disposing) return this.disposing
    this.lifetime.abort()
    clearInterval(this.timer)
    for (const target of this.targets.values()) this.remove(target)
    this.disposing = (async () => {
      await this.checking
      if (this.used) data(await this.driver.call('end_session', { session: this.session }, AbortSignal.timeout(5000)))
    })()
    return this.disposing
  }
}
