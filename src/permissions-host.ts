import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-typert-registry'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { permissionsRemote, type Permission, type PermissionsState } from './permissions-contract.ts'
import { NativePermissions } from './permissions-native.ts'

/** A settings-only API, never registered as an Agent tool. */
export class PermissionsService extends TypertRemoteService {
  constructor(ctx: Context, private permissions: NativePermissions) { super(ctx, 'unifiedCuaPermissions') }
  @Remote
  query(): Promise<PermissionsState> { return this.permissions.query() }
  @Remote
  request(): Promise<PermissionsState> { return this.permissions.request() }
  @Remote
  openSettings(permission: Permission): Promise<PermissionsState> { return this.permissions.openSettings(permission) }
}

export function registerPermissions(ctx: Context, enabled: () => boolean, createPermissions = () => new NativePermissions(enabled)): void {
  // Headless/minimal compositions need no Gateway; native automation remains usable there.
  ctx.inject(['typert'], scoped => {
    const permissions = createPermissions()
    new PermissionsService(scoped, permissions)
    scoped.effect(() => () => permissions.dispose())
    scoped.effect(() => scoped.typert.register({ package: permissionsRemote.package, face: 'host', schemas: [],
      model: { services: [], events: [], objects: [] }, invocations: permissionsRemote.descriptors }))
  })
}
