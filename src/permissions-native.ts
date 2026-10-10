/** TCC setup executes in the same Host process as NativeRuntime, without starting a driver. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { permissionSchema, type Permission, type PermissionsState } from './permissions-contract.ts'

interface PermissionSdk {
  currentMacOsPermissionStatus(): { accessibility: boolean; screenRecording: boolean }
  requestMacOsPermissions(): { accessibility: boolean; screenRecording: boolean }
}
const loadSdk = () => import('@trycua/cua-driver')
const openPane = async (permission: Permission) => {
  const pane = permission === 'accessibility' ? 'Privacy_Accessibility' : 'Privacy_ScreenCapture'
  await promisify(execFile)('/usr/bin/open', [`x-apple.systempreferences:com.apple.preference.security?${pane}`], { timeout: 5000 })
}

export class NativePermissions {
  private pending?: Promise<PermissionsState>
  private closed = false
  constructor(
    private enabled: () => boolean,
    private platform = process.platform,
    private sdk: () => Promise<PermissionSdk> = loadSdk,
    private open: (permission: Permission) => Promise<void> = openPane,
  ) {}
  async query(): Promise<PermissionsState> {
    this.assertActive()
    if (this.platform !== 'darwin') return { platform: this.platform, nativeEnabled: this.enabled(), accessibility: 'unsupported', screenRecording: 'unsupported' }
    const sdk = await this.sdk()
    this.assertActive()
    const status = sdk.currentMacOsPermissionStatus()
    return { platform: this.platform, nativeEnabled: this.enabled(),
      accessibility: status.accessibility ? 'granted' : 'notGranted',
      screenRecording: status.screenRecording ? 'granted' : 'notGranted' }
  }
  request(): Promise<PermissionsState> {
    // Multiple settings surfaces must not issue duplicate system prompts.
    if (this.pending) return this.pending
    const task = (async () => {
      this.assertEnabled()
      const sdk = await this.sdk()
      this.assertEnabled()
      sdk.requestMacOsPermissions()
      // A request returning does not mean the user granted permission.
      return this.query()
    })()
    this.pending = task
    void task.finally(() => { if (this.pending === task) this.pending = undefined }).catch(() => {})
    return task
  }
  async openSettings(permission: Permission): Promise<PermissionsState> {
    permissionSchema.parse(permission)
    this.assertEnabled()
    await this.open(permission)
    return this.query()
  }
  dispose(): void { this.closed = true }
  private assertActive(): void { if (this.closed) throw new Error('Permission setup is closed') }
  private assertEnabled(): void {
    this.assertActive()
    if (this.platform !== 'darwin') throw new Error('macOS permission setup is unavailable on this Host')
    if (!this.enabled()) throw new Error('Save Native app control as enabled before requesting permissions')
  }
}

/** Only operations that need a grant are blocked; diagnostics and discovery still work. */
export function requireNativePermissions(name: string, args: object, status: { accessibility: boolean; screenRecording: boolean }): void {
  if (['check_permissions', 'list_apps', 'list_windows', 'end_session'].includes(name)) return
  if (!status.accessibility) throw new Error('Native app control needs macOS Accessibility permission. Open this plugin’s settings, authorize access, then retry. Chrome browser automation remains available.')
  if (name === 'get_window_state' && Reflect.get(args, 'include_screenshot') === true && !status.screenRecording) {
    throw new Error('Native screenshots need macOS Screen Recording permission. Open this plugin’s settings, authorize access, then retry. Accessibility-only observations and Chrome browser automation remain available.')
  }
}
