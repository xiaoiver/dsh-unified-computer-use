/** Browser commands use DSH's authenticated client connection, without another server. */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection'
import { browserAction, resultSchema, type BrowserAction, type Result } from './protocol.ts'
import { errorText } from './errors.ts'

export interface BrowserEnvelope { id: string; owner: string; session: string; workspace: string; deadline: number; operation: BrowserAction }
interface Pending { envelope: BrowserEnvelope; client?: string; resolve: (result: Result) => void; reject: (error: Error) => void }
const uuid = z.string().uuid()
export class BrowserBroker {
  private pending = new Map<string, Pending>()
  private owners = new Map<string, { session: string; client?: string }>()
  constructor(ctx: Context) {
    const handle = async (endpoint: string, payload: unknown, signal: AbortSignal): Promise<ConnectionRpcResult<unknown>> => {
      try {
        if (endpoint === 'poll') {
          const input = z.object({ client: uuid, session: z.string().max(256).optional() }).strict().parse(payload)
          // A short wait avoids a high-frequency idle RPC loop, but cleanup still reaches the client promptly.
          await new Promise<void>(resolve => { const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve() }; const timer = setTimeout(finish, 500); signal.addEventListener('abort', finish, { once: true }); if (signal.aborted) finish() })
          const commands: BrowserEnvelope[] = []
          for (const item of this.pending.values()) {
            const owner = this.owners.get(item.envelope.owner)
            if (!owner || item.client || item.envelope.session !== input.session || (owner.client && owner.client !== input.client)) continue
            owner.client = input.client; item.client = input.client; commands.push(item.envelope)
            break
          }
          return { ok: true, value: { commands, owners: [...this.owners].filter(([, owner]) => owner.client === input.client).map(([id]) => id) } }
        }
        if (endpoint === 'reply') {
          const input = z.object({ client: uuid, id: uuid, result: resultSchema.optional(), error: z.string().max(8192).optional() }).strict().parse(payload)
          const item = this.pending.get(input.id)
          if (item && item.client === input.client) {
            this.pending.delete(input.id)
            if (input.error) item.reject(new Error(input.error))
            else if (input.result) item.resolve(input.result)
            else item.reject(new Error('Empty browser reply'))
          }
          return { ok: true, value: null }
        }
        throw new Error('Unknown browser endpoint')
      } catch (error) { return { ok: false, error: { code: 'CUA_BROWSER', message: errorText(error), details: {} } } }
    }
    // rc.2 reserves its single /api interceptor for the gateway. Exact Fetch routes
    // coexist with it and avoid rpc.handle's provider-context webServer dependency.
    const envelopeSchema = z.object({ type: z.literal('client-request'), rpcId: z.string().min(1).max(256), method: z.string(), payload: z.unknown() })
    for (const endpoint of ['poll', 'reply']) ctx.effect(() => ctx.connection.fetch.register({
      path: `/api/unified-cua/${endpoint}`, methods: ['POST'], requestBody: 'buffered',
      async fetch(request) {
        const envelope = envelopeSchema.safeParse(await request.json().catch(() => null))
        if (!envelope.success || envelope.data.method !== `unified-cua/${endpoint}`) return new Response('Invalid Computer Use request', { status: 400 })
        const reply = await handle(endpoint, envelope.data.payload, request.signal)
        return Response.json({ type: 'server-response', rpcId: envelope.data.rpcId, result: reply })
      },
    }))
  }
  async call(owner: string, session: string, workspace: string, operation: BrowserAction, signal: AbortSignal): Promise<Result> {
    signal.throwIfAborted()
    if (this.pending.size >= 32) throw new Error('Too many pending browser operations')
    if (!this.owners.has(owner)) this.owners.set(owner, { session })
    const id = randomUUID()
    const deferred = Promise.withResolvers<Result>()
    this.pending.set(id, { envelope: { id, owner, session, workspace, deadline: Date.now() + 30000, operation: browserAction.parse(operation) }, ...deferred })
    const abort = () => { this.pending.delete(id); this.release(owner); deferred.reject(new Error('Browser call canceled or timed out. Open the calling session in DSH Desktop and enable the plugin client. Do not replay uncertain input.')) }
    signal.addEventListener('abort', abort, { once: true })
    try { return await deferred.promise } finally { signal.removeEventListener('abort', abort); this.pending.delete(id) }
  }
  release(owner: string): void {
    this.owners.delete(owner)
    for (const [id, item] of this.pending) if (item.envelope.owner === owner) { this.pending.delete(id); item.reject(new Error('Browser owner was reset')) }
  }
  dispose(): void { for (const id of this.owners.keys()) this.release(id) }
}
