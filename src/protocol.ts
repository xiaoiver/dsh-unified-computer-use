/** Validated, versioned messages between a DSH plugin and its Electron parent. */
import { z } from 'zod'

const id = z.string().uuid()
const target = z.string().uuid()
const text = z.string().max(32_768)
export const browserAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('open'), url: z.string().max(8192), visible: z.boolean().default(true) }).strict(),
  z.object({ action: z.literal('list') }).strict(),
  z.object({ action: z.literal('observe'), target, screenshot: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal('navigate'), target, url: z.string().max(8192) }).strict(),
  z.object({ action: z.literal('click'), target, ref: z.string().max(128) }).strict(),
  z.object({ action: z.literal('fill'), target, ref: z.string().max(128), text }).strict(),
  z.object({ action: z.literal('press'), target, key: z.enum(['Enter', 'Tab', 'Escape', 'Backspace', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']) }).strict(),
  z.object({ action: z.literal('scroll'), target, x: z.number().min(-4096).max(4096).default(0), y: z.number().min(-4096).max(4096) }).strict(),
  z.object({ action: z.literal('reveal'), target }).strict(),
  z.object({ action: z.literal('close'), target }).strict(),
])
export type BrowserAction = z.infer<typeof browserAction>

export const nativeAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('apps') }).strict(),
  z.object({ action: z.literal('permissions') }).strict(),
  z.object({ action: z.literal('windows'), pid: z.number().int().positive() }).strict(),
  z.object({ action: z.literal('select'), pid: z.number().int().positive(), windowId: z.number().int().positive() }).strict(),
  z.object({ action: z.literal('observe'), target, screenshot: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal('act'), target, tool: z.enum(['click', 'set_value', 'type_text', 'press_key', 'hotkey', 'drag', 'scroll']), args: z.record(z.string(), z.json()) }).strict(),
  z.object({ action: z.literal('reveal'), target }).strict(),
  z.object({ action: z.literal('close'), target }).strict(),
])
export type NativeAction = z.infer<typeof nativeAction>

export const commandSchema = z.discriminatedUnion('surface', [
  z.object({ surface: z.literal('browser'), ...{ operation: browserAction } }).strict(),
  z.object({ surface: z.literal('native'), operation: nativeAction }).strict(),
  z.object({ surface: z.literal('session'), operation: z.enum(['state', 'reset']) }).strict(),
])
export type Command = z.infer<typeof commandSchema>

export const configSchema = z.object({
  native: z.boolean().default(true), pip: z.boolean().default(true),
  maxTargets: z.number().int().min(1).max(32).default(12),
  timeoutMs: z.number().int().min(1000).max(120_000).default(30_000),
  idleTimeoutMs: z.number().int().min(10_000).max(3_600_000).default(600_000),
}).strict()
export type RuntimeConfig = z.infer<typeof configSchema>

export const requestSchema = z.object({
  type: z.literal('dsh-cua/request'), version: z.literal(1), id, owner: id,
  operation: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('configure'), config: configSchema }).strict(),
    z.object({ kind: z.literal('command'), command: commandSchema }).strict(),
    z.object({ kind: z.literal('lifecycle'), state: z.enum(['resume', 'suspend', 'release']) }).strict(),
  ]),
}).strict()
export type Request = z.infer<typeof requestSchema>

export const resultSchema = z.object({
  content: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.literal('text'), text: z.string() }),
    z.object({ type: z.literal('image'), data: z.string(), mimeType: z.string() }),
  ])),
  structuredContent: z.record(z.string(), z.json()).optional(),
  isError: z.boolean().optional(),
})
export type Result = z.infer<typeof resultSchema>
export const replySchema = z.object({
  type: z.literal('dsh-cua/reply'), version: z.literal(1), id,
  result: resultSchema.optional(), error: z.string().optional(),
}).strict().refine(value => (value.result === undefined) !== (value.error === undefined))
export const cancelSchema = z.object({ type: z.literal('dsh-cua/cancel'), version: z.literal(1), id }).strict()

/** Make a canonical tool response; screenshots are appended only on explicit observation. */
export function result(data: Record<string, z.infer<ReturnType<typeof z.json>>>): Result {
  return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data }
}

/** Deny non-web navigation and access to the DSH application backend. */
export function webUrl(input: string, hostUrl?: string): string {
  const url = new URL(input)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only HTTP(S) URLs without embedded credentials are supported')
  if (hostUrl) {
    const host = new URL(hostUrl)
    if (url.port === host.port && (url.hostname === host.hostname || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      throw new Error('The DSH application backend cannot be opened in the controlled browser')
    }
  }
  return url.href
}
