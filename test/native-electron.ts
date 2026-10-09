/** Real driver integration against an isolated test app, never a user's working app. */
import { app, BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { writeFile, mkdir, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
import { createDesktopBridge } from '../src/desktop.ts'
import { configSchema, replySchema, type Request, type Result } from '../src/protocol.ts'

app.setPath('userData', await mkdtemp(join(tmpdir(), 'dsh-cua-native-')))
app.on('window-all-closed', () => {})
async function run() {
  const output = process.env.DSH_CUA_TEST_OUTPUT!
  await mkdir(output, { recursive: true })
  const fixture = spawn(process.env.DSH_CUA_NATIVE_FIXTURE!, [], { stdio: 'ignore' })
  const exited = new Promise<void>(resolve => fixture.once('exit', () => resolve()).once('error', () => resolve()))
  const pending = new Map<string, { resolve(r: Result): void; reject(e: Error): void }>()
  const bridge = createDesktopBridge({ hostUrl: () => undefined, send(value) {
    const reply = replySchema.parse(value)
    if (reply.error) pending.get(reply.id)?.reject(new Error(reply.error))
    else pending.get(reply.id)?.resolve(reply.result!)
    pending.delete(reply.id)
  } })
  const owner = randomUUID()
  function call(operation: Request['operation']) { return new Promise<Result>((resolve, reject) => {
    const id = randomUUID(); pending.set(id, { resolve, reject }); bridge.handle({ type: 'dsh-cua/request', version: 1, id, owner, operation })
  }) }
  const native = (operation: Extract<import('../src/protocol.ts').Command, { surface: 'native' }>['operation']) => call({ kind: 'command', command: { surface: 'native', operation } })
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  try {
    await call({ kind: 'configure', config: configSchema.parse({ native: true, pip: true }) })
    assert.ok(fixture.pid)
    let windowId: number | undefined
    for (let i = 0; i < 50 && !windowId; i++) {
      const windows = (await native({ action: 'windows', pid: fixture.pid })).structuredContent?.windows
      if (Array.isArray(windows)) for (const w of windows) if (w && typeof w === 'object' && !Array.isArray(w) && w.title === 'DSH Native Verification') windowId = Number(w.window_id)
      if (!windowId) await delay(100)
    }
    assert.ok(windowId, 'Native fixture window was not discovered')
    const selected = await native({ action: 'select', pid: fixture.pid, windowId })
    const target = String(selected.structuredContent?.target)
    function token(response: Result, role: string) {
      const elements = response.structuredContent?.elements
      assert.ok(Array.isArray(elements))
      const item = elements.find(e => e && typeof e === 'object' && !Array.isArray(e) && e.role === role)
      assert.ok(item && typeof item === 'object' && !Array.isArray(item), `Missing ${role}`)
      return String(item.element_token)
    }
    await native({ action: 'act', target, tool: 'set_value', args: { element_token: token(selected, 'AXTextField'), value: 'DeepSeek Harness' } })
    const filled = await native({ action: 'observe', target, screenshot: false })
    assert.match(JSON.stringify(filled), /DeepSeek Harness/)
    await native({ action: 'act', target, tool: 'click', args: { element_token: token(filled, 'AXButton'), action: 'press' } })
    const after = await native({ action: 'observe', target, screenshot: true })
    assert.match(JSON.stringify(after.structuredContent), /Saved DeepSeek Harness/)
    const screenshot = after.content.find(c => c.type === 'image')
    if (screenshot?.type === 'image') await writeFile(join(output, 'native-window.png'), Buffer.from(screenshot.data, 'base64'))
    const pip = () => BrowserWindow.getAllWindows().find(w => w.getTitle() === 'DSH Computer Use')
    let ready = false
    for (let i = 0; i < 100 && !ready; i++) { ready = !!pip() && await pip()!.webContents.executeJavaScript('document.querySelector("video")?.readyState>=2'); if (!ready) await delay(100) }
    assert.ok(ready, 'Native PiP did not receive a live media stream')
    const first = await pip()!.webContents.executeJavaScript('document.querySelector("video").currentTime')
    await delay(600)
    const second = await pip()!.webContents.executeJavaScript('document.querySelector("video").currentTime')
    assert.ok(second > first)
    await writeFile(join(output, 'native-pip.png'), (await pip()!.webContents.capturePage()).toPNG())
    // Preview monitoring must not replace the driver's last AX snapshot.
    await native({ action: 'act', target, tool: 'set_value', args: { element_token: token(after, 'AXTextField'), value: 'PiP preserves observation' } })
    fixture.kill('SIGTERM'); await exited
    await delay(2200)
    await assert.rejects(native({ action: 'observe', target, screenshot: false }), /closed|identity changed/)
    await call({ kind: 'lifecycle', state: 'release' })
    await writeFile(join(output, 'native-report.json'), JSON.stringify({ passed: true, electron: process.versions.electron, checks: ['real native window discovery', 'AX set value and click', 'post-action state and screenshot', 'live native PiP', 'PiP does not invalidate AX snapshot', 'source exit revokes control and preview'] }, null, 2))
    console.log('Native fixture and live PiP passed')
  } catch (error) {
    console.error(error)
    for (const w of BrowserWindow.getAllWindows()) console.error(await w.webContents.executeJavaScript('document.body.innerText').catch(() => 'Unavailable'))
    process.exitCode = 1
  } finally {
    fixture.kill('SIGTERM'); await exited
    await bridge.dispose()
    app.exit(process.exitCode ? 1 : 0)
  }
}
void app.whenReady().then(run).catch(error => { console.error(error); app.exit(1) })
