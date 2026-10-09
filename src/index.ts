/** Computer Use uses only the installed DSH host runtime. */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import * as host from './host-plugin.ts'
export const name = 'unified-computer-use'
export const inject = ['tools', 'agents', 'systemPrompt']
export interface Config {
  approval: 'ask' | 'inherit'
  timeoutMs: number
  idleTimeoutMs: number
  maxTargets: number
  native: boolean
}
export const Config = Schema.object({
  approval: Schema.union(['ask', 'inherit']).default('ask'),
  timeoutMs: Schema.number().min(1000).max(120000).step(1).default(30000),
  idleTimeoutMs: Schema.number().min(10000).max(3600000).step(1).default(600000),
  maxTargets: Schema.number().min(1).max(32).step(1).default(12),
  native: Schema.boolean().default(true),
})
export function apply(ctx: Context, input: Config): void {
  ctx.plugin(host, Config(input) as Config)
}
