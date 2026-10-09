/** Validated Computer Use operations and results across the REPL/Host boundary. */
import { z } from 'zod'
import { playwrightOperation } from './browser-contract.ts'

const target = z.string().uuid()
export const browserAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('open'), url: z.string().max(8192) }).strict(),
  z.object({ action: z.literal('list') }).strict(),
  z.object({ action: z.literal('prepare') }).strict(),
  z.object({ action: z.literal('observe'), target, screenshot: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal('navigate'), target, url: z.string().max(8192) }).strict(),
  z.object({ action: z.literal('reveal'), target }).strict(),
  z.object({ action: z.literal('close'), target }).strict(),
  playwrightOperation,
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
])
export type Command = z.infer<typeof commandSchema>

export const resultSchema = z.object({
  content: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.literal('text'), text: z.string() }),
    z.object({ type: z.literal('image'), data: z.string(), mimeType: z.string() }),
  ])),
  structuredContent: z.record(z.string(), z.json()).optional(),
  isError: z.boolean().optional(),
})
export type Result = z.infer<typeof resultSchema>
/** Make a canonical tool response; screenshots are appended only on explicit observation. */
export function result(data: Record<string, z.infer<ReturnType<typeof z.json>>>): Result {
  return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data }
}
