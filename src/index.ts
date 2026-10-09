/** Prefer the installed DSH runtime; companion is an explicit compatibility option. */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import * as legacy from './legacy.ts'
import * as host from './host-plugin.ts'
export const name = 'unified-computer-use'
export const inject = ['tools', 'agents', 'systemPrompt']
export interface Config extends legacy.Config { backend: 'host' | 'companion' }
export const Config = Schema.intersect([
  Schema.object({ backend: Schema.union(['host', 'companion']).default('host') }), legacy.Config,
])
export function apply(ctx: Context, input: Config): void {
  const config = Config(input) as Config
  if (config.backend === 'companion') { const { backend, ...options } = config; legacy.apply(ctx, options) }
  else ctx.plugin(host, config)
}
