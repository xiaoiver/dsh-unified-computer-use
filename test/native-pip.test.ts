import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { NativePip, type PipTransport } from '../src/native-pip.ts'
import manifest from '../native/manifest.json' with { type: 'json' }
const target = (id: string) => ({ id, pid: 123, windowId: id === 'one' ? 7 : 8, title: 'Fixture' })
const tick = () => new Promise(resolve => setImmediate(resolve))
function transport() {
  const sent: unknown[] = []
  let closes = 0
  return { sent, get closes() { return closes }, port: { send: (command: unknown) => { sent.push(command) }, close: async () => { closes++ } } }
}
test('PiP cannot open pending targets after an idle transition', async () => {
  const gate = Promise.withResolvers<PipTransport>(), t = transport()
  const pip = new NativePip(assert.fail, true, async () => gate.promise)
  pip.activate(target('one')); pip.activate(target('two')); pip.finish()
  gate.resolve(t.port); await tick()
  assert.deepEqual(t.sent, [])
  pip.resume(); pip.activate(target('two')); await tick()
  assert.deepEqual(t.sent, [{ action: 'resume' }, { action: 'open', target: 'two', pid: 123, windowId: 8, title: 'Fixture', slot: 1 }])
  pip.close('unknown'); assert.equal(t.sent.length, 2)
  pip.close('two'); assert.deepEqual(t.sent.at(-1), { action: 'close', target: 'two' })
  await pip.dispose(); await pip.dispose(); assert.equal(t.closes, 1)
})
test('dismissal is respected for the turn and isolated between owners', async () => {
  const a = transport(), b = transport()
  let notice!: (event: string, message?: string, target?: string) => void
  const first = new NativePip(assert.fail, true, async fn => { notice = fn; return a.port })
  const second = new NativePip(assert.fail, true, async () => b.port)
  first.activate(target('one')); second.activate(target('two')); await tick()
  notice('dismissed', undefined, 'one'); first.activate(target('one'));  await tick()
  assert.equal(a.sent.length, 1); assert.equal(b.sent.length, 1)
  first.resume(); first.activate(target('two')); await tick()
  assert.equal(a.sent.length, 3)
  await first.dispose(); assert.equal(b.closes, 0)
  await second.dispose()
})
test('startup failure is retryable; disposal waits for a delayed child without opening a window', async () => {
  const errors: string[] = [], t = transport(), gate = Promise.withResolvers<PipTransport>()
  let attempts = 0
  const pip = new NativePip(message => errors.push(message), true, async () => {
    if (++attempts === 1) throw new Error('unavailable')
    return gate.promise
  })
  pip.activate(target('one')); await tick()
  assert.match(errors[0], /unavailable/)
  pip.activate(target('two')); const disposing = pip.dispose()
  gate.resolve(t.port); await disposing; await tick()
  assert.equal(attempts, 2); assert.equal(t.closes, 1); assert.deepEqual(t.sent, [])
  pip.activate(target('one')); assert.equal(attempts, 2)
})
test('invalid targets and unsupported platforms do not launch or capture', async () => {
  let launched = 0
  const factory = async () => { launched++; return transport().port }
  const unsupported = new NativePip(assert.fail, false, factory)
  unsupported.activate(target('one')); await tick(); await unsupported.dispose()
  const pip = new NativePip(assert.fail, true, factory)
  for (const windowId of [0, -1, NaN, 0x100000000]) pip.activate({ ...target('one'), windowId })
  pip.activate({ ...target('one'), pid: 0 })
  await tick(); await pip.dispose(); assert.equal(launched, 0)
})
test('shipped universal helper and source match the pinned manifest', async () => {
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
  const binary = await readFile(new URL('../native/bin/dsh-native-pip', import.meta.url))
  assert.equal(hash(binary), manifest.sha256)
  for (const [path, checksum] of Object.entries(manifest.sources)) assert.equal(hash(await readFile(new URL('../' + path, import.meta.url))), checksum)
  assert.equal(binary.readUInt32BE(0), 0xcafebabe)
  assert.equal(binary.readUInt32BE(4), 2)
  assert.deepEqual(new Set([binary.readUInt32BE(8), binary.readUInt32BE(28)]), new Set([0x1000007, 0x100000c]))
})

test('one owner keeps multiple previews; closing or dismissing one leaves the other live', async () => {
  const t = transport()
  let notice!: (event: string, message?: string, target?: string) => void
  const pip = new NativePip(assert.fail, true, async fn => { notice = fn; return t.port })
  pip.activate(target('one')); pip.activate(target('two')); await tick()
  const opens = t.sent as { action: string; target: string; slot: number }[]
  assert.deepEqual(opens.map(c => c.target), ['one', 'two'])
  assert.notEqual(opens[0].slot, opens[1].slot)
  notice('dismissed', undefined, 'one')
  pip.activate(target('one')); pip.activate(target('two')); await tick()
  assert.equal(opens.length, 3); assert.equal(opens[2].target, 'two')
  pip.close('one'); assert.deepEqual(opens.at(-1), { action: 'close', target: 'one' })
  pip.activate(target('two')); await tick(); assert.equal(opens.at(-1)?.target, 'two')
  await pip.dispose()
})
test('late startup drops closed targets and stacking slots span owners and are reclaimed', async () => {
  const t = transport(), other = transport(), gate = Promise.withResolvers<PipTransport>()
  const pip = new NativePip(assert.fail, true, async () => gate.promise)
  const second = new NativePip(assert.fail, true, async () => other.port)
  pip.activate(target('one')); pip.activate(target('two')); pip.close('one')
  second.activate(target('one')); gate.resolve(t.port); await tick()
  const first = t.sent[0] as { target: string; slot: number }
  const next = other.sent[0] as { slot: number }
  assert.equal(t.sent.length, 1); assert.equal(first.target, 'two'); assert.notEqual(first.slot, next.slot)
  await pip.dispose(); await second.dispose()
  const fresh = transport(), third = new NativePip(assert.fail, true, async () => fresh.port)
  third.activate(target('one')); await tick()
  assert.equal((fresh.sent[0] as { slot: number }).slot, 0)
  await third.dispose()
})
