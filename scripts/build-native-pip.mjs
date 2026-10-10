// Maintainer build only. End users receive the universal binary in the bundle.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
if (process.platform !== 'darwin') throw new Error('Build the PiP helper on macOS with Xcode command line tools')
const staging = await mkdtemp(join(tmpdir(), 'dsh-pip-build-'))
const binary = 'native/bin/dsh-native-pip'
try {
  await mkdir('native/bin', { recursive: true })
  for (const arch of ['arm64', 'x86_64']) execFileSync('xcrun', ['swiftc', '-swift-version', '5', '-O', '-target', `${arch}-apple-macos13.0`, 'native/NativePip.swift', 'native/PipPanel.swift', '-o', join(staging, arch)], { stdio: 'inherit' })
  execFileSync('xcrun', ['lipo', '-create', join(staging, 'arm64'), join(staging, 'x86_64'), '-output', binary])
  execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', binary], { stdio: 'inherit' })
  const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
  await writeFile('native/manifest.json', JSON.stringify({ version: 1, minMacOS: '13.0', sha256: sha256(await readFile(binary)), sources: Object.fromEntries(await Promise.all(['native/NativePip.swift', 'native/PipPanel.swift'].map(async path => [path, sha256(await readFile(path))]))) }, null, 2) + '\n')
} finally { await rm(staging, { recursive: true, force: true }) }
