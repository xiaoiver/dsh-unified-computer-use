/** Computer Use uses only the installed DSH host runtime. */
import Schema from '@deepseek-ai/schemastery'
export { inject, apply } from './host-plugin.ts'
export const name = 'unified-computer-use'
export interface Config {
  approval: 'ask' | 'inherit'
  timeoutMs: number
  idleTimeoutMs: number
  maxTargets: number
  native: boolean
}
export const Config = Schema.object({
  approval: Schema.union(['ask', 'inherit']).default('ask').volatile(),
  timeoutMs: Schema.number().min(1000).max(120000).step(1).default(30000).volatile(),
  idleTimeoutMs: Schema.number().min(10000).max(3600000).step(1).default(600000).volatile(),
  maxTargets: Schema.number().min(1).max(32).step(1).default(12).volatile(),
  native: Schema.boolean().default(true).volatile(),
})
