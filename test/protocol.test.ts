import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { commandSchema, requestSchema, result, webUrl } from '../src/protocol.ts'
import { DesktopTransport } from '../src/transport.ts'

test('browser navigation rejects local files, embedded credentials, and the host on loopback aliases', () => {
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'https://user:pass@example.com', 'http://localhost:3001/', 'http://[::1]:3001/']) {
    assert.throws(() => webUrl(url, 'http://127.0.0.1:3001/?token=private'))
  }
  assert.equal(webUrl('http://127.0.0.1:3000/', 'http://127.0.0.1:3001/'), 'http://127.0.0.1:3000/')
})
test('the wire does not admit raw CDP, code, arbitrary target paths or owner changes in commands', () => {
  for (const input of [
    { surface: 'browser', operation: { action: 'evaluate', code: 'process.env' } },
    { surface: 'browser', operation: { action: 'open', url: 'https://example.com', owner: randomUUID() } },
    { surface: 'native', operation: { action: 'act', target: randomUUID(), tool: 'launch_app', args: {} } },
  ]) assert.equal(commandSchema.safeParse(input).success, false)
  assert.equal(requestSchema.safeParse({ type: 'dsh-cua/request', version: 2 }).success, false)
})

class Port extends EventEmitter {
  sent: object[] = []
  send(message: object, callback?: (error: Error | null) => void) { this.sent.push(message); callback?.(null); return true }
}
test('IPC correlates requests and ignores unrelated and late replies', async () => {
  const port = new Port(), transport = new DesktopTransport(port, 1000)
  const operation = transport.call(randomUUID(), { kind: 'lifecycle', state: 'suspend' }, new AbortController().signal)
  const request = requestSchema.parse(port.sent[0])
  port.emit('message', { type: 'dsh-cua/reply', version: 1, id: randomUUID(), result: result({ wrong: true }) })
  port.emit('message', { type: 'dsh-cua/reply', version: 1, id: request.id, result: result({ paused: true }) })
  assert.deepEqual((await operation).structuredContent, { paused: true })
  transport.close()
  assert.equal(port.listenerCount('message'), 0)
})
test('cancellation tells the parent and rejects the caller without replay', async () => {
  const port = new Port(), transport = new DesktopTransport(port, 1000), abort = new AbortController()
  const operation = transport.call(randomUUID(), { kind: 'lifecycle', state: 'resume' }, abort.signal)
  abort.abort()
  await assert.rejects(operation, /canceled/)
  assert.equal(port.sent.length, 2)
  assert.equal(Reflect.get(port.sent[1]!, 'type'), 'dsh-cua/cancel')
  transport.close()
})
test('disconnect rejects all pending requests and removes handlers', async () => {
  const port = new Port(), transport = new DesktopTransport(port, 1000)
  const pending = transport.call(randomUUID(), { kind: 'lifecycle', state: 'resume' }, new AbortController().signal)
  port.emit('disconnect')
  await assert.rejects(pending, /disconnected/)
  assert.equal(port.listenerCount('message'), 0)
})

test('IPC deadline reports the missing bridge and sends a cancellation', async () => {
  const port = new EventEmitter() as EventEmitter & { send: (message: object, callback?: (error: Error | null) => void) => boolean }
  const sent: object[] = []
  port.send = (message, callback) => { sent.push(message); callback?.(null); return true }
  const transport = new DesktopTransport(port, 10)
  try {
    await assert.rejects(transport.call(randomUUID(), { kind: 'lifecycle', state: 'release' }, new AbortController().signal), /bridge timed out/)
    assert.equal(sent.length, 2)
    assert.equal(Reflect.get(sent[1]!, 'type'), 'dsh-cua/cancel')
  } finally { transport.close() }
})
