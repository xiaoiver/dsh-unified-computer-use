/** Read-only GUI-worker probe; does not grant permissions, move cursors or send input. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NativeHelperInstaller, createNativeDriver } from '../src/native-helper.ts'

test('macOS private workers have cursor facilities, isolated PIDs and deterministic shutdown', { skip: process.platform !== 'darwin', timeout: 360_000 }, async () => {
  const helper = new NativeHelperInstaller()
  const drivers = []
  const pids: number[] = []
  try {
    for (let i = 0; i < 2; i++) {
      const driver = await createNativeDriver(helper, AbortSignal.timeout(320_000))
      drivers.push(driver)
      const meta = await driver.metadata()
      assert.equal(meta.driverVersion, '0.34.0')
      assert.notEqual(meta.pid, process.pid)
      assert.ok(!pids.includes(meta.pid)); pids.push(meta.pid)
      const reply = JSON.parse((await driver.callTool('get_agent_cursor_state', JSON.stringify({ session: 'dsh-worker-test' }))).rawJson)
      assert.notEqual(reply.isError, true)
      assert.equal(reply.structuredContent.enabled, true)
      assert.equal(reply.structuredContent.theme.id, 'cua.default')
      assert.equal(reply.structuredContent.position, null)
    }
  } finally {
    for (const driver of drivers) { try { await driver.shutdown() } finally { if ('uniffiDestroy' in driver) (driver.uniffiDestroy as () => void)() } }
    await helper.dispose()
  }
  for (const pid of pids) assert.throws(() => process.kill(pid, 0), (error: NodeJS.ErrnoException) => error.code === 'ESRCH')
})
