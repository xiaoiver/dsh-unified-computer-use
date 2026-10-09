import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveElectron } from '../src/runtime.ts'
import { errorText } from '../src/errors.ts'

test('cold download preserves a plain-object DSH cancellation reason instead of object Object', { skip: process.platform !== 'darwin' || process.arch !== 'arm64' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-cold-download-'))
  const original = globalThis.fetch
  const abort = new AbortController()
  globalThis.fetch = async () => { abort.abort({ kind: 'user' }); throw abort.signal.reason }
  try {
    await assert.rejects(resolveElectron({ electronExecutable: '', runtimeDirectory: directory }, abort.signal, () => {}), /runtime download canceled or timed out: user/)
    assert.ok(!(await readdir(directory)).includes('electron-44.7.0-darwin-arm64'))
  } finally { globalThis.fetch = original; await rm(directory, { recursive: true, force: true }) }
})

test('diagnostics preserve cross-realm messages and network error causes without dumping unrelated fields', () => {
  assert.equal(errorText({ message: 'fetch failed', cause: { code: 'ECONNRESET', secret: 'private' } }), 'fetch failed: ECONNRESET')
})
