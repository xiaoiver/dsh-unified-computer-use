import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
if (process.platform !== 'darwin') throw new Error('Native PiP layout tests require macOS')
const staging = await mkdtemp(join(tmpdir(), 'dsh-pip-test-'))
try {
  const executable = join(staging, 'pip-test')
  execFileSync('xcrun', ['swiftc', '-swift-version', '5', '-target', `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macos13.0`, '-D', 'PIP_UI_FIXTURE', 'native/NativePip.swift', 'native/PipPanel.swift', 'test/native-pip-ui.swift', '-o', executable], { stdio: 'inherit' })
  execFileSync(executable, ['--test'], { stdio: 'inherit' })
} finally { await rm(staging, { recursive: true, force: true }) }
