/** Translate the standard DSH Remote result into the settings UI's business API. */
import type { TypertClientRemote, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { permissionsSchema, type PermissionsApi, type PermissionsState } from './permissions-contract.ts'

function unwrap(result: RemoteResult<PermissionsState>): PermissionsState {
  if (!result.ok) throw new Error(result.error.message)
  return permissionsSchema.parse(result.value)
}
export function permissionsApi(remote: TypertClientRemote): PermissionsApi {
  return {
    query: async () => unwrap(await remote.unifiedCuaPermissions.query()),
    request: async () => unwrap(await remote.unifiedCuaPermissions.request()),
    openSettings: async permission => unwrap(await remote.unifiedCuaPermissions.openSettings(permission)),
  }
}
