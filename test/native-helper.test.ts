import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NativeHelperInstaller, nativeHelper } from '../src/native-helper.ts'
const archive = Buffer.from('pinned archive'), binary = Buffer.from('pinned executable')
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const manifest = { ...nativeHelper, archiveSha256: hash(archive), binarySha256: hash(binary) }
const signal = () => new AbortController().signal
async function fixture(run: (cache: string) => Promise<void>) {
  const cache = await mkdtemp(join(tmpdir(), 'dsh-native-helper-test-'))
  try { await run(cache) } finally { await rm(cache, { recursive: true, force: true }) }
}
test('helper preparation coalesces; a cancelled caller does not cancel another or the reusable download', async () => fixture(async cache => {
  const gate = Promise.withResolvers<Uint8Array>()
  let downloads = 0
  const helper = new NativeHelperInstaller({ cache, manifest, download: async () => { downloads++; return gate.promise }, extract: async () => binary })
  const abort = new AbortController()
  try {
    const cancelled = helper.prepare(abort.signal), pending = helper.prepare(signal())
    abort.abort(new Error('cell cancelled'))
    await assert.rejects(cancelled, /cell cancelled/)
    gate.resolve(archive)
    const path = await pending
    assert.equal(downloads, 1)
    assert.deepEqual(await readFile(path), binary)
    assert.equal((await stat(path)).mode & 0o777, 0o700)
    assert.equal(await helper.prepare(signal()), path)
    assert.equal(downloads, 1)
    assert.deepEqual(await readdir(cache), ['cua-driver'])
  } finally { await helper.dispose() }
}))
test('archive and executable checksums reject unverified content and permit a later retry', async () => fixture(async cache => {
  let validArchive = false, validBinary = false, extractions = 0
  const helper = new NativeHelperInstaller({ cache, manifest,
    download: async () => validArchive ? archive : Buffer.from('tampered archive'),
    extract: async () => { extractions++; return validBinary ? binary : Buffer.from('tampered binary') },
  })
  try {
    await assert.rejects(helper.prepare(signal()), error => (error as Error).cause instanceof Error && /archive checksum/.test(String((error as Error).cause)))
    assert.equal(extractions, 0)
    validArchive = true
    await assert.rejects(helper.prepare(signal()), error => /executable checksum/.test(String((error as Error).cause)))
    assert.deepEqual(await readdir(cache), [])
    validBinary = true
    await helper.prepare(signal())
    assert.deepEqual(await readFile(join(cache, 'cua-driver')), binary)
  } finally { await helper.dispose() }
}))
test('cached executable is reverified and repaired when its contents change', async () => fixture(async cache => {
  let downloads = 0
  const helper = new NativeHelperInstaller({ cache, manifest, download: async () => { downloads++; return archive }, extract: async () => binary })
  try {
    const path = await helper.prepare(signal())
    await writeFile(path, 'corrupted')
    await helper.prepare(signal())
    assert.equal(downloads, 2)
    assert.deepEqual(await readFile(path), binary)
  } finally { await helper.dispose() }
}))
test('unloading cancels download, removes staging files and prevents later preparation', async () => fixture(async cache => {
  const started = Promise.withResolvers<void>()
  const helper = new NativeHelperInstaller({ cache, manifest, download: async (_url, abort) => new Promise((_resolve, reject) => {
    abort.addEventListener('abort', () => reject(abort.reason), { once: true }); started.resolve()
  }) })
  const pending = helper.prepare(signal())
  const rejected = assert.rejects(pending, /unloaded/)
  await started.promise
  await helper.dispose(); await rejected
  assert.deepEqual(await readdir(cache), [])
  await assert.rejects(helper.prepare(signal()), /unloaded/)
}))

test('runtime disposal cancels initialization and tolerates a failed startup', async () => {
  const { NativeRuntime } = await import('../src/native.ts')
  const helper = new NativeHelperInstaller()
  const entered = Promise.withResolvers<void>()
  const runtime = new NativeRuntime(helper, async abort => new Promise((_resolve, reject) => {
    abort.addEventListener('abort', () => reject(abort.reason), { once: true }); entered.resolve()
  }))
  const call = runtime.call('end_session', {}, signal())
  const rejected = assert.rejects(call, /closed/)
  await entered.promise; await runtime.dispose(); await rejected
  await runtime.dispose()
  await assert.rejects(runtime.call('end_session', {}, signal()), /closed/)
  await helper.dispose()
})

test('runtime releases native binding even if worker shutdown reports an error', async () => {
  const { NativeRuntime } = await import('../src/native.ts')
  let destroyed = 0, stopped = 0
  const helper = new NativeHelperInstaller()
  const runtime = new NativeRuntime(helper, async () => ({
    callTool: async () => ({ rawJson: JSON.stringify({ content: [], structuredContent: {} }) }),
    shutdown: async () => { stopped++; throw new Error('worker exited') },
    uniffiDestroy: () => { destroyed++ },
  }) as unknown as import('@trycua/cua-driver').CuaDriverLike)
  await runtime.call('end_session', {}, signal())
  await assert.rejects(runtime.dispose(), /worker exited/)
  await assert.rejects(runtime.dispose(), /worker exited/)
  assert.equal(stopped, 1); assert.equal(destroyed, 1)
  await helper.dispose()
})

test('runtime can retry a failed helper startup without resetting the REPL', async () => {
  const { NativeRuntime } = await import('../src/native.ts')
  let starts = 0, stops = 0
  const helper = new NativeHelperInstaller()
  const runtime = new NativeRuntime(helper, async () => {
    if (++starts === 1) throw new Error('download unavailable')
    return {
      callTool: async () => ({ rawJson: JSON.stringify({ content: [], structuredContent: { ok: true } }) }),
      shutdown: async () => { stops++ },
    } as unknown as import('@trycua/cua-driver').CuaDriverLike
  })
  try {
    await assert.rejects(runtime.call('end_session', {}, signal()), /download unavailable/)
    assert.deepEqual((await runtime.call('end_session', {}, signal())).structuredContent, { ok: true })
    assert.equal(starts, 2)
  } finally { await runtime.dispose(); await helper.dispose() }
  assert.equal(stops, 1)
})
