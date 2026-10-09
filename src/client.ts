/** Desktop client extension provides settings and explicit permission setup. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import { registerSettings } from './settings-client.ts'
import { permissionsRemote } from './permissions-contract.ts'
import { permissionsApi } from './permissions-client.ts'
export const inject = ['slots', 'configForms', 'locale', 'remote']
export async function apply(ctx: Context): Promise<void> {
  await ctx.effect(() => ctx.remote.$mount(permissionsRemote))
  registerSettings(ctx, permissionsApi(ctx.remote))
}
