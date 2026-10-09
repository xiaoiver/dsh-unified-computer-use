import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { BrowserBroker } from '../src/browser-broker.ts'
import { Context } from '@deepseek-ai/cordis'
import { HostConnectionService } from '@deepseek-ai/dsh-client-connection'
import { result } from '../src/protocol.ts'
async function fixture() {
  const ctx = new Context()
  let connection!: HostConnectionService
  await ctx.plugin({ apply(scope) { connection = new HostConnectionService(scope, [], {} as never) } })
  // The real stock service already has the gateway's only shared interceptor.
  connection.rpc.intercept('/api', () => true, async () => ({ ok: true, value: 'gateway' }))
  let broker!: BrowserBroker
  await ctx.inject(['connection'], scope => { broker = new BrowserBroker(scope) })
  const carrier = connection.createSharedFetchHandler('/api')
  const rpc = async (endpoint: string, payload: unknown) => {
    const method = 'unified-cua/' + endpoint
    const response = await carrier.fetch(new Request('http://localhost/api/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload }) }))
    assert.equal(response.status, 200)
    return (await response.json() as { result: { ok: boolean; value: unknown } }).result
  }
  const dispose = async () => { broker.dispose(); await ctx.fiber.dispose() }
  return { broker, rpc, dispose }
}
test('browser commands bind to one client and ignore mismatched or late replies', async () => {
  const { broker, rpc, dispose } = await fixture()
  const owner = randomUUID(), client = randomUUID()
  const abort = new AbortController()
  const pending = broker.call(owner, 'session', '/fixture', { action: 'list' }, abort.signal)
  try {
    const poll = await rpc('poll', { client, session: 'session' })
    assert.equal(poll.ok, true)
    const command = (poll as { value: { commands: { id: string }[] } }).value.commands[0]
    let settled = false; void pending.then(() => { settled = true }, () => { settled = true })
    await rpc('reply', { client: randomUUID(), id: command.id, result: result({ bad: true }) })
    assert.equal(settled, false)
    await rpc('reply', { client, id: command.id, result: result({ ok: true }) })
    assert.equal((await pending).structuredContent?.ok, true)
    const next = broker.call(owner, 'session', '/fixture', { action: 'list' }, abort.signal)
    const rejected = assert.rejects(next, /reset|canceled/)
    abort.abort()
    await rejected
    await rpc('reply', { client, id: command.id, result: result({ ignored: true }) })
  } finally { await dispose() }
})
test('browser commands are not offered to another session', async () => {
  const { broker, rpc, dispose } = await fixture()
  const abort = new AbortController()
  const pending = broker.call(randomUUID(), 'owner-session', '/fixture', { action: 'list' }, abort.signal)
  const rejected = assert.rejects(pending, /reset|canceled/)
  const poll = await rpc('poll', { client: randomUUID(), session: 'other-session' })
  assert.deepEqual((poll as { value: { commands: unknown[] } }).value.commands, [])
  abort.abort(); await rejected; await dispose()
})
