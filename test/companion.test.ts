import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Companion } from '../src/companion.ts'
import { companionEnvironment } from '../src/runtime.ts'
import { fakeCompanion } from './fake-companion.ts'

test('companion launch removes Node-mode, hooks, and credentials inherited from the Host', () => {
  const env = companionEnvironment({ PATH: '/bin', HOME: '/fixture', ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '--require=private', DSH_API_KEY: 'secret', OPENAI_API_KEY: 'secret' })
  assert.deepEqual(env, { HOME: '/fixture', PATH: '/bin' })
})
test('concurrent requests share one child and disposal waits for exit and removes its profile', async () => {
  const fixture = await fakeCompanion()
  const companion = new Companion({ electronExecutable: fixture.executable, runtimeDirectory: fixture.directory, startupTimeoutMs: 5000, timeoutMs: 1000 })
  try {
    const owners = [randomUUID(), randomUUID()]
    const values = await Promise.all(owners.map(owner => companion.call(owner, { kind: 'lifecycle', state: 'resume' }, new AbortController().signal)))
    assert.deepEqual(values.map(v => v.structuredContent?.owner), owners)
    assert.equal((await readdir(join(fixture.directory, 'sessions'))).length, 1)
    const first = companion.dispose(); assert.equal(companion.dispose(), first); await first
    assert.equal(companion.running, false)
    assert.deepEqual(await readdir(join(fixture.directory, 'sessions')), [])
    await assert.rejects(companion.call(randomUUID(), { kind: 'lifecycle', state: 'resume' }, new AbortController().signal))
  } finally { await companion.dispose(); await fixture.dispose() }
})
