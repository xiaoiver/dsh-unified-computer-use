/** Observable permission setup state; loading, grants and failures are distinct. */
import type { Permission, PermissionsApi, PermissionsState } from './permissions-contract.ts'

export type PermissionOperation = 'query' | 'request' | 'openSettings'
export interface PermissionFailure { operation: PermissionOperation; message: string; code?: string }
export interface PermissionSnapshot {
  status?: PermissionsState
  busy: boolean
  requested: boolean
  failure?: PermissionFailure
}
function diagnostic(error: unknown): { message: string; code?: string } {
  // Remote failures can cross module/realm boundaries and need not be Error instances.
  const object = error && typeof error === 'object' ? error as Record<string, unknown> : undefined
  const message = typeof object?.message === 'string' ? object.message : String(error)
  const code = typeof object?.code === 'string' ? object.code.slice(0, 100) : undefined
  return { message: message.slice(0, 1000), ...(code ? { code } : {}) }
}
export class PermissionSetup {
  private state: PermissionSnapshot = { busy: false, requested: false }
  private listeners = new Set<() => void>()
  private pending?: Promise<void>
  private generation = 0
  private active = false
  constructor(private readonly api: PermissionsApi, private readonly timeoutMs = 30000) {}
  getSnapshot = (): PermissionSnapshot => this.state
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  start(): void { this.active = true; void this.query() }
  stop(): void { this.active = false; this.generation++; this.pending = undefined }
  query = (): Promise<void> => this.run('query', () => this.api.query())
  request = (): Promise<void> => this.run('request', () => this.api.request())
  openSettings = (permission: Permission): Promise<void> => this.run('openSettings', () => this.api.openSettings(permission))
  private publish(state: PermissionSnapshot): void { this.state = state; for (const listener of this.listeners) listener() }
  private run(operation: PermissionOperation, action: () => Promise<PermissionsState>): Promise<void> {
    if (!this.active) return Promise.resolve()
    if (this.pending) return this.pending
    const generation = ++this.generation
    this.publish({ ...this.state, busy: true, failure: undefined })
    const current = () => this.active && this.generation === generation
    let timer: ReturnType<typeof setTimeout>
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Permission operation timed out. Recheck the current status before requesting again.')), this.timeoutMs)
    })
    const pending = (async () => {
      try {
        const status = await Promise.race([Promise.resolve().then(() => {
          if (!current()) throw new Error('Permission view was closed')
          return action()
        }), timeout])
        if (current()) this.publish({ status, busy: false, requested: this.state.requested || operation === 'request' })
      } catch (error) {
        // Never display a stale grant after a failed refresh or uncertain request.
        if (current()) this.publish({ busy: false, requested: this.state.requested, failure: { operation, ...diagnostic(error) } })
      } finally {
        clearTimeout(timer!)
        if (this.generation === generation) this.pending = undefined
      }
    })()
    this.pending = pending
    return pending
  }
}
