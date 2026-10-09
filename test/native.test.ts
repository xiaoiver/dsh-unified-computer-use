import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NativeSurface, type DriverPort } from '../src/native.ts'
import { result } from '../src/protocol.ts'

const signal = new AbortController().signal
class Driver implements DriverPort {
  calls: { name: string; args: Record<string, unknown> }[] = []
  alive = true
  async call(name: string, args: Record<string, unknown>) {
    this.calls.push({ name, args })
    if (name === 'list_apps') return result({ apps: [{ pid: 123, name: 'Fixture', bundle_id: 'test.fixture' }] })
    if (name === 'list_windows') return result({ windows: this.alive ? [{ pid: 123, window_id: 7, title: 'Fixture', layer: 0 }] : [] })
    if (name === 'get_window_state') return result({ pid: 123, window_id: 7, elements: [{ role: 'AXButton', element_token: 's12345678:1' }] })
    return result({ effect: 'confirmed' })
  }
}
function surface(driver: Driver) { return new NativeSurface(driver, 4, () => {}, () => {}, async () => { throw new Error('No fixture screen capture') }) }
test('native actions cannot override session, selected process, output paths, or input delivery mode', async () => {
  const driver = new Driver(), native = surface(driver)
  try {
    const selected = await native.execute({ action: 'select', pid: 123, windowId: 7 }, signal)
    const target = String(selected.structuredContent?.target)
    for (const key of ['session', 'pid', 'window_id', 'target', 'debug_image_out', 'delivery_mode']) {
      await assert.rejects(native.execute({ action: 'act', target, tool: 'click', args: { [key]: 'override' } }, signal), /Unsupported/)
    }
    await assert.rejects(native.execute({ action: 'act', target, tool: 'click', args: { element_token: 'another-session-token' } }, signal), /not in this target/)
    await native.execute({ action: 'act', target, tool: 'click', args: { element_token: 's12345678:1' } }, signal)
    const click = driver.calls.find(c => c.name === 'click')!
    assert.equal(click.args.pid, 123); assert.equal(click.args.window_id, 7); assert.equal(click.args.delivery_mode, 'background')
    assert.match(String(click.args.session), /^dsh-/)
    await assert.rejects(native.execute({ action: 'act', target, tool: 'click', args: {} }, signal), /Observe/)
  } finally { await native.dispose() }
  assert.equal(driver.calls.at(-1)?.name, 'end_session')
})
test('disappearing native window revokes its handle without substituting another window', async () => {
  const driver = new Driver(), native = surface(driver)
  try {
    const selected = await native.execute({ action: 'select', pid: 123, windowId: 7 }, signal)
    driver.alive = false
    await assert.rejects(native.execute({ action: 'observe', target: String(selected.structuredContent?.target), screenshot: false }, signal), /identity changed/)
    assert.equal(driver.calls.filter(c => c.name === 'get_window_state').length, 1)
  } finally { await native.dispose() }
})
test('coordinates require a screenshot and pause invalidates native observations', async () => {
  const driver = new Driver(), native = surface(driver)
  try {
    const selected = await native.execute({ action: 'select', pid: 123, windowId: 7 }, signal)
    const target = String(selected.structuredContent?.target)
    await assert.rejects(native.execute({ action: 'act', target, tool: 'click', args: { x: 10, y: 20 } }, signal), /screenshot/)
    native.invalidateAll()
    await assert.rejects(native.execute({ action: 'act', target, tool: 'click', args: { element_token: 's12345678:1' } }, signal), /Observe/)
  } finally { await native.dispose() }
})
