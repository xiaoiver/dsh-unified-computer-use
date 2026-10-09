import { app, BrowserWindow, webContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
import { createDesktopBridge } from '../src/desktop.ts'
import { configSchema, replySchema, type Command, type Request, type Result } from '../src/protocol.ts'

const testHome = await mkdtemp(join(tmpdir(), 'dsh-cua-electron-'))
app.setPath('userData', testHome)
app.commandLine.appendSwitch('disable-background-timer-throttling')
const output = process.env.DSH_CUA_TEST_OUTPUT!
await mkdir(output, { recursive: true })
async function run() {
console.log('electron ready')
const server = createServer((request, response) => {
  if (request.url === '/slow') return
  response.setHeader('content-type', 'text/html')
  response.end(`<!doctype html><title>Computer Use Fixture</title><style>body{font:20px system-ui;background:#eef2fb;padding:60px}input,button{font:inherit;padding:12px}#animation{margin-top:30px;padding:30px;background:#d5e3ff;border-radius:12px}</style><h1>DSH browser verification</h1><label>Name <input aria-label="Name"></label><button onclick="document.querySelector('#result').textContent='Saved '+document.querySelector('input').value">Save</button><p id="result" role="status">Ready</p><div id="animation">Live frame <span id="tick"></span></div><script>window.events=[];for(const kind of ['mousedown','mouseup','click'])document.addEventListener(kind,e=>window.events.push([kind,e.target.tagName,e.clientX,e.clientY]));setInterval(()=>{document.querySelector('#tick').textContent=Date.now();document.querySelector('#animation').style.transform='translateX('+Math.round(Math.sin(Date.now()/300)*25)+'px)'},50)</script>`)
})
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
assert.ok(address && typeof address === 'object')
const url = `http://127.0.0.1:${address.port}/`
const pending = new Map<string, { resolve(r: Result): void; reject(e: Error): void }>()
const bridge = createDesktopBridge({ hostUrl: () => 'http://127.0.0.1:1/', send(value) {
  const reply = replySchema.parse(value)
  if (reply.error) pending.get(reply.id)?.reject(new Error(reply.error))
  else pending.get(reply.id)?.resolve(reply.result!)
  pending.delete(reply.id)
} })
const owner = randomUUID(), other = randomUUID()
function call(owner: string, operation: Request['operation'], id: string = randomUUID()) {
  return new Promise<Result>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    bridge.handle({ type: 'dsh-cua/request', version: 1, id, owner, operation })
  })
}
const command = (c: Command, id?: string) => call(owner, { kind: 'command', command: c }, id)
const checks: string[] = []
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
async function until(check: () => Promise<boolean>, description: string) {
  const deadline = Date.now() + 12_000
  while (Date.now() < deadline) { if (await check()) return; await delay(100) }
  throw new Error(`Timed out: ${description}`)
}
try {
  const config = configSchema.parse({ native: false, pip: true })
  await call(owner, { kind: 'configure', config })
  await call(other, { kind: 'configure', config })
  const opened = await command({ surface: 'browser', operation: { action: 'open', url, visible: false } })
  const target = String(opened.structuredContent?.target)
  const observe = () => command({ surface: 'browser', operation: { action: 'observe', target, screenshot: false } })
  function ref(response: Result, role: string, name: string) {
    const data = response.structuredContent?.elements
    assert.ok(Array.isArray(data))
    const element = data.find(e => e && typeof e === 'object' && !Array.isArray(e) && e.role === role && e.name === name)
    assert.ok(element && typeof element === 'object' && !Array.isArray(element), `Missing ${role}: ${name}`)
    return String(element.ref)
  }
  await command({ surface: 'browser', operation: { action: 'fill', target, ref: ref(opened, 'textbox', 'Name'), text: 'DeepSeek Harness' } })
  const filled = await observe()
  assert.match(JSON.stringify(filled), /DeepSeek Harness/)
  const staleRef = ref(filled, 'button', 'Save')
  const fresh = await observe()
  await assert.rejects(command({ surface: 'browser', operation: { action: 'click', target, ref: staleRef } }), /Stale/)
  const again = await observe()
  await command({ surface: 'browser', operation: { action: 'click', target, ref: ref(again, 'button', 'Save') } })
  await until(async () => JSON.stringify(await observe()).includes('Saved DeepSeek Harness'), 'form result')
  checks.push('real IAB open, AX observation, fill, trusted click, post-action verification, stale-reference refusal')
  await assert.rejects(call(other, { kind: 'command', command: { surface: 'browser', operation: { action: 'observe', target, screenshot: false } } }), /another session/)
  checks.push('cross-session target isolation')
  const pip = () => BrowserWindow.getAllWindows().find(w => w.getTitle() === 'DSH Computer Use')
  await until(async () => !!pip() && await pip()!.webContents.executeJavaScript('document.querySelector("video").readyState>=2'), 'live PiP video')
  const firstTime = await pip()!.webContents.executeJavaScript('document.querySelector("video").currentTime')
  await delay(650)
  const secondTime = await pip()!.webContents.executeJavaScript('document.querySelector("video").currentTime')
  assert.ok(secondTime > firstTime, 'Video frames must continue without tool calls')
  await writeFile(join(output, 'picture-in-picture.png'), (await pip()!.webContents.capturePage()).toPNG())
  const browser = BrowserWindow.getAllWindows().find(w => w.getTitle() === 'DSH Browser')!
  await writeFile(join(output, 'built-in-browser.png'), (await browser.webContents.capturePage()).toPNG())
  checks.push('real display-media PiP advances between tool calls; screenshots recorded')
  await call(owner, { kind: 'lifecycle', state: 'suspend' })
  assert.equal(pip(), undefined)
  await assert.rejects(observe(), /paused/)
  await call(owner, { kind: 'lifecycle', state: 'resume' })
  assert.match(JSON.stringify(await observe()), /Saved DeepSeek Harness/)
  await until(async () => !!pip(), 'resumed preview')
  await until(async () => !!pip() && await pip()!.webContents.executeJavaScript('document.readyState === "complete" && !!window.cuaView'), 'resumed preview document')
  await pip()!.webContents.executeJavaScript('setTimeout(() => window.cuaView.request({action:"close"}), 0); true')
  await until(async () => !pip(), 'closed preview')
  assert.equal(pip(), undefined)
  assert.match(JSON.stringify(await observe()), /Saved DeepSeek Harness/)
  assert.equal(pip(), undefined)
  checks.push('pause destroys receiver; resume retains page; close preview suppresses it without closing target')
  const cancelId = randomUUID()
  const navigation = command({ surface: 'browser', operation: { action: 'navigate', target, url: url + 'slow' } }, cancelId)
  await delay(150)
  bridge.handle({ type: 'dsh-cua/cancel', version: 1, id: cancelId })
  await assert.rejects(navigation)
  checks.push('canceled navigation settles without replay')
  await call(owner, { kind: 'lifecycle', state: 'release' })
  await call(other, { kind: 'lifecycle', state: 'release' })
  assert.equal(BrowserWindow.getAllWindows().length, 0)
  checks.push('release destroys all owned windows')
  await writeFile(join(output, 'electron-report.json'), JSON.stringify({ passed: true, electron: process.versions.electron, checks }, null, 2))
  console.log(JSON.stringify({ passed: true, checks }))
} catch (error) {
  console.error(error)
  for (const c of webContents.getAllWebContents().filter(c => c.getURL() === url)) {
    console.error('fixture state', await c.executeJavaScript('({body:document.body.innerText,input:document.querySelector("input").value,events:window.events})'))
    await writeFile(join(output, 'failure-fixture.png'), (await c.capturePage()).toPNG())
  }
  for (const w of BrowserWindow.getAllWindows()) {
    console.error('window', w.getTitle(), await w.webContents.executeJavaScript('document.body.innerText').catch(() => 'unavailable'))
  }
  process.exitCode = 1
} finally {
  await bridge.dispose()
  server.closeAllConnections()
  server.close()
  app.exit(process.exitCode ? 1 : 0)
}

}
void app.whenReady().then(run).catch(error => { console.error(error); app.exit(1) })
