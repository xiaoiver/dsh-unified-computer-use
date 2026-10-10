/** Pinned, plugin-owned macOS GUI worker. No shell installer or shared daemon. */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, lstat, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { CuaDriverLike } from '@trycua/cua-driver'

export const nativeHelper = {
  version: '0.34.0',
  url: 'https://github.com/trycua/cua/releases/download/cua-driver-rs-v0.34.0/cua-driver-rs-0.34.0-darwin-universal-binary.tar.gz',
  archiveSha256: '940dc008e0f7c5d217d14c0f247d1ebab91b1bac965f4a649d19e8c789bdfd81',
  binarySha256: '47fa8722003066246ee8a828d3fe2c769f2194d6cf3ad63ae6f0becdc00d383a',
}
const exec = promisify(execFile)
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
async function verified(path: string, expected: string): Promise<boolean> {
  try {
    if (!(await lstat(path)).isFile()) return false
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(path)) hash.update(chunk)
    return hash.digest('hex') === expected
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
async function download(url: string, signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, { signal })
  if (!response.ok || !response.body) throw new Error(`Native helper download failed (HTTP ${response.status})`)
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 64 * 1024 * 1024) throw new Error('Native helper download exceeds the size limit')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  return Buffer.concat(chunks)
}
async function extract(archive: string, signal: AbortSignal): Promise<Uint8Array> {
  // Read only this regular member into memory; never unpack archive paths into the cache.
  const { stdout } = await exec('/usr/bin/tar', ['-xOf', archive, 'cua-driver'], { encoding: 'buffer', maxBuffer: 100 * 1024 * 1024, signal })
  return stdout
}
interface InstallerOptions {
  cache?: string
  manifest?: typeof nativeHelper
  download?: typeof download
  extract?: typeof extract
}
/** A timed-out cell stops waiting, but the shared bounded download can finish for a retry. */
export class NativeHelperInstaller {
  private pending?: Promise<string>
  private lifetime = new AbortController()
  private cache: string
  private manifest: typeof nativeHelper
  constructor(private options: InstallerOptions = {}) {
    this.manifest = options.manifest ?? nativeHelper
    this.cache = options.cache ?? join(homedir(), 'Library', 'Caches', 'dsh-unified-computer-use', 'native', this.manifest.version, 'darwin-universal')
  }
  async prepare(signal: AbortSignal): Promise<string> {
    signal.throwIfAborted(); this.lifetime.signal.throwIfAborted()
    if (!this.pending) {
      const task = this.install()
      this.pending = task
      void task.finally(() => { if (this.pending === task) this.pending = undefined }).catch(() => {})
    }
    const task = this.pending
    return new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      task.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
      if (signal.aborted) abort()
    })
  }
  private async install(): Promise<string> {
    const signal = AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(300_000)])
    const binary = join(this.cache, 'cua-driver')
    if (await verified(binary, this.manifest.binarySha256)) { signal.throwIfAborted(); await chmod(binary, 0o700); return binary }
    await mkdir(this.cache, { recursive: true, mode: 0o700 })
    const staging = await mkdtemp(join(this.cache, '.install-'))
    try {
      const bytes = await (this.options.download ?? download)(this.manifest.url, signal)
      signal.throwIfAborted()
      if (digest(bytes) !== this.manifest.archiveSha256) throw new Error('Native helper archive checksum mismatch')
      const archive = join(staging, 'driver.tar.gz')
      await writeFile(archive, bytes, { mode: 0o600 })
      const executable = await (this.options.extract ?? extract)(archive, signal)
      signal.throwIfAborted()
      if (digest(executable) !== this.manifest.binarySha256) throw new Error('Native helper executable checksum mismatch')
      const staged = join(staging, 'cua-driver')
      await writeFile(staged, executable, { mode: 0o700 })
      signal.throwIfAborted()
      await rename(staged, binary)
      return binary
    } catch (error) {
      if (signal.aborted) throw signal.reason
      throw new Error('Could not prepare the native cursor helper. Check access to GitHub and retry the native operation.', { cause: error })
    } finally { await rm(staging, { recursive: true, force: true }) }
  }
  async dispose(): Promise<void> {
    this.lifetime.abort(new Error('Native helper preparation stopped because the plugin was unloaded'))
    await this.pending?.catch(() => {})
  }
}

export async function createNativeDriver(helper: NativeHelperInstaller, signal: AbortSignal): Promise<CuaDriverLike> {
  const sdk = await import('@trycua/cua-driver')
  signal.throwIfAborted()
  if (process.platform !== 'darwin') return sdk.CuaDriver.create({ claudeCodeCompatibility: false })
  if (!['arm64', 'x64'].includes(process.arch)) throw new Error('Native cursor helper requires macOS arm64 or x64')
  const binaryPath = await helper.prepare(signal)
  signal.throwIfAborted()
  return sdk.CuaDriver.createPrivateWorker({
    binaryPath, hostBundleId: 'com.deepseek.dsh', startupTimeoutMs: 15_000n, shutdownTimeoutMs: 5_000n,
    environment: [], inheritStderr: true,
    configuredDriver: { claudeCodeCompatibility: false, authorization: {
      allowedModes: [sdk.SessionPermissionMode.Standard], compatibilityMode: sdk.SessionPermissionMode.Standard,
      unrestrictedAcknowledged: false, maxSessionTtlSeconds: 86_400n, maxIdleTtlSeconds: 3_600n,
    } },
  })
}
