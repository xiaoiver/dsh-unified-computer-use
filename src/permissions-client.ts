/** Own the dynamic Remote namespace before exposing the settings API. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type { TypertClientRemote, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { permissionsRemote, permissionsSchema, type PermissionsApi, type PermissionsState } from './permissions-contract.ts'

function unwrap(result: RemoteResult<PermissionsState>): PermissionsState {
  // Preserve the Remote code and message for diagnostics, rather than replacing
  // every failure with an apparent connection or macOS permission failure.
  if (!result.ok) throw result.error
  return permissionsSchema.parse(result.value)
}
export function permissionsApi(remote: TypertClientRemote): PermissionsApi {
  return {
    query: async () => unwrap(await remote.unifiedCuaPermissions.query()),
    request: async () => unwrap(await remote.unifiedCuaPermissions.request()),
    openSettings: async permission => unwrap(await remote.unifiedCuaPermissions.openSettings(permission)),
  }
}

export async function mountPermissionsClient(ctx: Context, ready: (scoped: Context, api: PermissionsApi) => void): Promise<void> {
  await ctx.effect(() => ctx.remote.$mount(permissionsRemote))
  // Mount first, then depend on the service it creates. Adding this dependency
  // to the outer plugin would deadlock startup: that plugin creates the service.
  ctx.inject(['remote.unifiedCuaPermissions'], scoped => {
    ready(scoped, permissionsApi(scoped.remote))
  })
}
