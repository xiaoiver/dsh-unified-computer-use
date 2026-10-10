/** Shared wire contract; importing this module never loads a native library. */
import type { InvocationDescriptor, RemoteResult, TypertRemoteContribution, TypertSchema } from '@deepseek-ai/dsh-typert-protocol'

export type Permission = 'accessibility' | 'screenRecording'
type PermissionStatus = 'granted' | 'notGranted' | 'unsupported'
export interface PermissionsState {
  platform: string
  nativeEnabled: boolean
  accessibility: PermissionStatus
  screenRecording: PermissionStatus
}
// Typert's codec contract needs only parse(). Keep this small shared Client
// boundary independent of the Host's Zod runtime.
export const permissionSchema: TypertSchema<Permission> = {
  parse(value: unknown): Permission {
    if (value !== 'accessibility' && value !== 'screenRecording') throw new TypeError('Unknown permission')
    return value
  },
}
function isStatus(value: unknown): value is PermissionStatus {
  return value === 'granted' || value === 'notGranted' || value === 'unsupported'
}
export const permissionsSchema: TypertSchema<PermissionsState> = {
  parse(value: unknown): PermissionsState {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid permission state')
    const raw = value as Record<string, unknown>
    const fields = ['platform', 'nativeEnabled', 'accessibility', 'screenRecording']
    if (Object.keys(raw).length !== fields.length || fields.some(key => !Object.hasOwn(raw, key))) throw new TypeError('Invalid permission state fields')
    if (typeof raw.platform !== 'string' || typeof raw.nativeEnabled !== 'boolean' || !isStatus(raw.accessibility) || !isStatus(raw.screenRecording)) throw new TypeError('Invalid permission state values')
    return { platform: raw.platform, nativeEnabled: raw.nativeEnabled, accessibility: raw.accessibility, screenRecording: raw.screenRecording }
  },
}
export interface PermissionsApi {
  query(): Promise<PermissionsState>
  request(): Promise<PermissionsState>
  openSettings(permission: Permission): Promise<PermissionsState>
}
const packageName = 'dsh-unified-computer-use'
const namespace = 'unifiedCuaPermissions'
const descriptors: InvocationDescriptor[] = ['query', 'request', 'openSettings'].map(method => ({
  id: `${packageName}#${namespace}/${method}`,
  service: namespace, namespace, method,
  invocation: { kind: 'direct' },
  parameters: method === 'openSettings' ? [{ name: 'permission', wire: 'permission', source: 'json',
    codec: { mode: 'strict', typeSymbol: `${packageName}#permission`, create: () => permissionSchema } }] : [],
  result: { mode: 'strict', typeSymbol: `${packageName}#permissions`, create: () => permissionsSchema },
}))
// Explicit descriptors keep the Host and Client boundary identical without source reflection.
export const permissionsRemote: TypertRemoteContribution = { package: packageName, descriptors }

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    unifiedCuaPermissions: {
      query(): Promise<RemoteResult<PermissionsState>>
      request(): Promise<RemoteResult<PermissionsState>>
      openSettings(permission: Permission): Promise<RemoteResult<PermissionsState>>
    }
  }
}
