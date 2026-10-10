/** Desktop client extension provides settings and explicit permission setup. */
import type { Context } from '@deepseek-ai/cordis'
import { registerSettings } from './settings-client.ts'
import { mountPermissionsClient } from './permissions-client.ts'
export const inject = ['slots', 'configForms', 'locale', 'remote']
export async function apply(ctx: Context): Promise<void> {
  await mountPermissionsClient(ctx, registerSettings)
}
