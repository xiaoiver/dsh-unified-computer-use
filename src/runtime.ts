/** A checksum-pinned Electron distribution, independent of the DSH installation. */
import { homedir } from 'node:os'
import { join, isAbsolute } from 'node:path'
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { downloadArtifact } from '@electron/get'

export const ELECTRON_VERSION = '44.7.0'
const archive = 'electron-v44.7.0-darwin-arm64.zip'
const checksum = 'e04e411b58a0a14375dd21b0ab4a378fd38930a702e4e20e322fee4849404c0b'
export interface RuntimeOptions { electronExecutable: string; runtimeDirectory: string }
export function runtimeDirectory(options: RuntimeOptions): string {
  const root = options.runtimeDirectory || join(homedir(), 'Library', 'Caches', 'dsh-unified-computer-use')
  if (!isAbsolute(root)) throw new Error('runtimeDirectory must be an absolute path')
  return root
}

/** No install scripts: the first approved operation prepares the pinned runtime. */
export async function resolveElectron(options: RuntimeOptions, signal: AbortSignal, log: (text: string) => void): Promise<string> {
  signal.throwIfAborted()
  if (options.electronExecutable) {
    if (!isAbsolute(options.electronExecutable)) throw new Error('electronExecutable must be an absolute path')
    await access(options.electronExecutable)
    return options.electronExecutable
  }
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('This release supports macOS Apple Silicon. Other platforms are not yet supported.')
  }
  const cache = runtimeDirectory(options)
  const target = join(cache, `electron-${ELECTRON_VERSION}-darwin-arm64`)
  const executable = join(target, 'Electron.app', 'Contents', 'MacOS', 'Electron')
  const ready = async () => {
    try {
      if (await readFile(join(target, 'ready.sha256'), 'utf8') !== checksum) return false
      await access(executable)
      return true
    } catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false; throw error }
  }
  if (await ready()) return executable
  await mkdir(cache, { recursive: true })
  log(`Preparing Electron ${ELECTRON_VERSION}; the first use downloads a desktop runtime from GitHub.`)
  const zip = await downloadArtifact({ version: ELECTRON_VERSION, artifactName: 'electron', platform: 'darwin', arch: 'arm64',
    checksums: { [archive]: checksum }, cacheRoot: join(cache, 'downloads'), downloadOptions: { signal, quiet: true } })
  signal.throwIfAborted()
  const staging = await mkdtemp(join(cache, '.extract-'))
  try {
    const { extract } = await import('@electron-internal/extract-zip')
    await extract(zip, { dir: staging })
    signal.throwIfAborted()
    await writeFile(join(staging, 'ready.sha256'), checksum)
    try { await rename(staging, target) }
    catch (error) { if (!await ready()) throw error }
  } finally { await rm(staging, { recursive: true, force: true }) }
  if (!await ready()) throw new Error('Electron runtime extraction did not complete')
  return executable
}

/** Keep launch-time Node hooks and account credentials out of the GUI process. */
export function companionEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const names = ['HOME', 'USER', 'LOGNAME', 'PATH', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'SystemRoot', 'WINDIR', 'LOCALAPPDATA']
  return Object.fromEntries(names.flatMap(name => source[name] === undefined ? [] : [[name, source[name]]]))
}
