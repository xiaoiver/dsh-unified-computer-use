/** Desktop client extension only provides the plugin settings form. */
import type { Context } from '@deepseek-ai/cordis'
import { registerSettings } from './settings-client.ts'
export const inject = ['slots', 'configForms', 'locale']
export function apply(ctx: Context): void { registerSettings(ctx) }
