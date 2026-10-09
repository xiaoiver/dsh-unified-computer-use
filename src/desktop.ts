/** Electron resource owner, used by the standalone companion process. */
import { app, desktopCapturer } from 'electron'
import { BrowserSurface } from './browser.ts'
import { NativeRuntime, NativeSurface } from './native.ts'
import { PreviewWindows } from './pip.ts'
import { cancelSchema, requestSchema, result, type Request, type Result, type RuntimeConfig } from './protocol.ts'

interface Owner {
  config: RuntimeConfig; browser: BrowserSurface; native: NativeSurface; previews: PreviewWindows
  lifetime: AbortController; tail: Promise<void>; suspended: boolean; touched: number; closing?: Promise<void>
}
export interface DesktopBridgeOptions {
  send(message: object): void
  hostUrl(): string | undefined
}

/** A single trusted spawning plugin owns this bridge. IPC never exposes a renderer-facing CDP endpoint. */
export class DesktopBridge {
  private owners = new Map<string, Owner>()
  private retired = new Set<string>()
  private pending = new Map<string, { owner: string; abort: AbortController }>()
  private tasks = new Set<Promise<void>>()
  private native = new NativeRuntime()
  private closed = false
  private disposing?: Promise<void>
  private timer: ReturnType<typeof setInterval>
  constructor(private options: DesktopBridgeOptions) {
    this.timer = setInterval(() => {
      for (const [id, owner] of this.owners) {
        if (Date.now() - owner.touched > owner.config.idleTimeoutMs && ![...this.pending.values()].some(p => p.owner === id)) {
          void this.release(id).catch(error => console.error('DSH Computer Use cleanup:', error))
        }
      }
    }, 5000)
    this.timer.unref()
  }

  /** Return true only for this extension's reserved message namespace. */
  handle(value: unknown): boolean {
    if (typeof value !== 'object' || !value || !('type' in value) || typeof value.type !== 'string' || !value.type.startsWith('dsh-cua/')) return false
    if (this.closed) {
      const closing = requestSchema.safeParse(value)
      if (closing.success) {
        const op = closing.data.operation
        this.reply(closing.data.id, op.kind === 'lifecycle' && op.state === 'release'
          ? { result: result({ released: true }) } : { error: 'Desktop Computer Use is shutting down' })
      }
      return true
    }
    const canceled = cancelSchema.safeParse(value)
    if (canceled.success) {
      const pending = this.pending.get(canceled.data.id)
      if (pending) {
        pending.abort.abort(new Error('Computer Use canceled'))
        const owner = this.owners.get(pending.owner)
        if (owner) { owner.suspended = true; owner.previews.suspend(); owner.browser.invalidateAll(); owner.native.invalidateAll() }
      }
      return true
    }
    const parsed = requestSchema.safeParse(value)
    if (!parsed.success) return true
    const request = parsed.data
    if (this.pending.has(request.id)) return true
    const abort = new AbortController()
    this.pending.set(request.id, { owner: request.owner, abort })
    const task = this.dispatch(request, abort.signal).then(
      response => this.reply(request.id, { result: response }),
      error => this.reply(request.id, { error: error instanceof Error ? error.message : String(error) }),
    ).finally(() => { this.pending.delete(request.id); this.tasks.delete(task) })
    this.tasks.add(task)
    return true
  }
  private reply(id: string, payload: { result: Result } | { error: string }): void {
    this.options.send({ type: 'dsh-cua/reply', version: 1, id, ...payload })
  }
  private async dispatch(request: Request, signal: AbortSignal): Promise<Result> {
    signal.throwIfAborted()
    const { operation, owner: id } = request
    if (operation.kind === 'configure') {
      if (this.retired.has(id)) throw new Error('Session resource expired; reset Computer Use before continuing')
      if (!this.owners.has(id)) {
        if (this.owners.size >= 32) throw new Error('Too many live Computer Use sessions')
        const config = operation.config
        const previews = new PreviewWindows(config.pip)
        const browser = new BrowserSurface(this.options.hostUrl, config.maxTargets, t => previews.touch(t), key => previews.invalidate(key))
        const native = new NativeSurface(this.native, config.maxTargets, t => previews.touch(t), key => previews.invalidate(key), async (windowId, active) => {
          const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false })
          active.throwIfAborted()
          const source = sources.find(s => s.id.split(':')[1] === String(windowId))
          if (!source) throw new Error('Selected native window is not available for capture')
          return source
        })
        this.owners.set(id, { config, previews, browser, native, lifetime: new AbortController(), tail: Promise.resolve(), suspended: false, touched: Date.now() })
      }
      return result({ ready: true, protocol: 1, surfaces: ['browser', ...(operation.config.native ? ['native'] : [])] })
    }
    if ((operation.kind === 'lifecycle' && operation.state === 'release') || (operation.kind === 'command' && operation.command.surface === 'session' && operation.command.operation === 'reset')) {
      await this.release(id)
      return result({ released: true })
    }
    const owner = this.owners.get(id)
    if (!owner || owner.closing) throw new Error('Session resource expired; reset Computer Use before continuing')
    owner.touched = Date.now()
    if (operation.kind === 'lifecycle') {
      owner.suspended = operation.state === 'suspend'
      if (owner.suspended) { owner.previews.suspend(); owner.browser.invalidateAll(); owner.native.invalidateAll() }
      else owner.previews.resume()
      return result({ state: operation.state })
    }
    const command = operation.command
    if (command.surface === 'session') return result({ state: owner.suspended ? 'paused' : 'active', protocol: 1 })
    if (owner.suspended) throw new Error('Computer Use is paused; continue in a new turn and observe again')
    const active = AbortSignal.any([signal, owner.lifetime.signal, AbortSignal.timeout(owner.config.timeoutMs)])
    const job = owner.tail.then(async () => {
      active.throwIfAborted()
      if (owner.suspended) throw new Error('Computer Use is paused')
      try {
        const output = command.surface === 'browser'
          ? await owner.browser.execute(command.operation, active)
          : owner.config.native ? await owner.native.execute(command.operation, active) : (() => { throw new Error('Native Computer Use is disabled in configuration') })()
        active.throwIfAborted()
        return output
      } catch (error) {
        owner.browser.invalidateAll(); owner.native.invalidateAll()
        if (active.aborted) { owner.suspended = true; owner.previews.suspend() }
        throw error
      } finally { owner.touched = Date.now() }
    })
    owner.tail = job.then(() => {}, () => {})
    return job
  }
  private release(id: string): Promise<void> {
    const owner = this.owners.get(id)
    if (!owner) return Promise.resolve()
    if (owner.closing) return owner.closing
    this.retired.add(id)
    owner.lifetime.abort(new Error('Session closed'))
    owner.previews.dispose()
    owner.browser.dispose()
    owner.closing = (async () => {
      await owner.tail
      await owner.native.dispose()
      this.owners.delete(id)
    })()
    return owner.closing
  }
  dispose(): Promise<void> {
    if (this.disposing) return this.disposing
    this.closed = true
    this.disposing = this.teardown()
    return this.disposing
  }
  private async teardown(): Promise<void> {
    clearInterval(this.timer)
    for (const pending of this.pending.values()) pending.abort.abort(new Error('Desktop disconnected'))
    const releases = await Promise.allSettled([...this.owners.keys()].map(id => this.release(id)))
    await Promise.allSettled(this.tasks)
    await this.native.dispose()
    const errors = releases.flatMap(r => r.status === 'rejected' ? [r.reason] : [])
    if (errors.length) throw new AggregateError(errors, 'Computer Use cleanup failed')
  }
}

/** Main-process extension entry. The caller owns disposal before destroying its child. */
export function createDesktopBridge(options: DesktopBridgeOptions): DesktopBridge {
  if (!app.isReady()) throw new Error('Computer Use requires Electron app.whenReady()')
  return new DesktopBridge(options)
}
