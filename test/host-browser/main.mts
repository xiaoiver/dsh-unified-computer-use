import { app, BrowserWindow, ipcMain, protocol } from 'electron'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { DesktopBrowserGuests } from 'stock-browser-guests'
import { DESKTOP_IPC } from 'stock-ipc'
import { BrowserBroker } from '../../src/browser-broker.ts'
protocol.registerSchemesAsPrivileged([{ scheme: 'dsh-app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])
async function run() {
  const directory = process.env.DSH_CUA_BROWSER_FIXTURE
  const profile = await mkdtemp(join(tmpdir(), 'dsh-host-browser-'))
  app.setPath('userData', profile)
  const deadline = setTimeout(() => app.exit(1), 30000)
  await app.whenReady()
  const server = createServer((_req,res) => {res.setHeader('content-type','text/html');res.end('<style>body{background:white;color:#202124}</style><title>Plugin client fixture</title><label>Name<input></label><button onclick="document.querySelector(\'output\').textContent=document.querySelector(\'input\').value">Save</button><output>Waiting</output>')})
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve))
  const routes = new Map()
  const broker = new BrowserBroker({ effect: setup => setup(), connection:{fetch:{register:route=>{routes.set(route.path,route);return()=>{}}}} } as never)
  ipcMain.handle('fixture-rpc', async (_event,endpoint,payload) => {
    const response = await routes.get('/api/'+endpoint).fetch(new Request('http://localhost/api/'+endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:randomUUID(),method:endpoint,payload})}))
    return (await response.json()).result
  })
  const theme = await readFile(join(process.env.DSH_SOURCE!, 'packages/client/ui-theme/src/styles/design-platform.css'), 'utf8')
  const renderer = await readFile(join(directory,'renderer.js'),'utf8')
  protocol.handle('dsh-app', () => new Response('<html><head><style>'+theme+'</style></head><body style="margin:0;height:600px"><div id="root" style="height:600px"></div><script>'+renderer+'</script></body></html>', {headers:{'content-type':'text/html'}}))
  const window = new BrowserWindow({show:false,width:900,height:700,webPreferences:{preload:join(directory,'preload.cjs'),sandbox:true,contextIsolation:true,webviewTag:true}})
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}))
  const guests = new DesktopBrowserGuests(()=>'http://127.0.0.1:1/')
  guests.bind(window,()=>()=>{})
  ipcMain.handle(DESKTOP_IPC.browserAcquire,(event,workspace)=>guests.acquire(event.sender,workspace))
  ipcMain.handle(DESKTOP_IPC.browserRelease,(event,lease)=>guests.release(event.sender,lease))
  window.webContents.on('console-message',(_event,_level,message)=>console.log('Renderer:',message))
  const owner=randomUUID()
  const call=operation=>broker.call(owner,'fixture-session','fixture-workspace',operation,AbortSignal.timeout(10000))
  try {
    await window.loadURL('dsh-app://app/fixture')
    const opened=await call({action:'open',url:`http://127.0.0.1:${server.address().port}/`,visible:true})
    assert.match(JSON.stringify(opened),/Plugin client fixture/)
    const target=opened.structuredContent.target
    const input=opened.structuredContent.elements.find(e=>e.tag==='input').ref
    const filled=await call({action:'fill',target,ref:input,text:'DSH host browser passed'})
    const button=filled.structuredContent.elements.find(e=>e.tag==='button').ref
    const clicked=await call({action:'click',target,ref:button})
    assert.match(JSON.stringify(clicked),/DSH host browser passed/)
    const screenshot=await call({action:'observe',target,screenshot:true})
    assert.ok(screenshot.content.some(c=>c.type==='image'&&c.data.length>100))
    await assert.rejects(broker.call(randomUUID(),'fixture-session','fixture-workspace',{action:'observe',target,screenshot:false},AbortSignal.timeout(5000)),/another session/)
    // Browser chrome must not remount guests or discard page state.
    const js = (source: string) => window.webContents.executeJavaScript(source)
    await call({action:'open',url:`http://127.0.0.1:${server.address().port}/second`,visible:true})
    await js(`window.firstGuest = document.querySelector('webview'); document.querySelectorAll('webview')[1].executeJavaScript('document.title = "A long browser tab title — ".repeat(12)')`)
    await js(`new Promise(resolve => setTimeout(resolve, 100))`)
    await js(`document.querySelector('.cua-select').click()`)
    assert.equal(await js(`document.querySelector('webview') === window.firstGuest && window.firstGuest.style.display !== 'none'`),true)
    assert.match(JSON.stringify(await call({action:'observe',target,screenshot:false})),/DSH host browser passed/)
    assert.equal(await js(`document.querySelector('.cua-address').readOnly`),true)
    assert.equal(await js(`document.querySelector('.cua-address').value`),`http://127.0.0.1:${server.address().port}/`)
    // Metadata refresh keeps keyboard focus and address selection.
    await js(`document.querySelector('.cua-address').focus(); document.querySelector('.cua-address').select(); window.fixtureLocale('zh')`)
    assert.equal(await js(`document.activeElement === document.querySelector('.cua-address') && document.activeElement.selectionEnd === document.activeElement.value.length`),true)
    assert.equal(await js(`document.querySelector('.cua-address').getAttribute('aria-label')`),'网页地址（只读）')
    const capture = async (name: string) => {
      if (!process.env.DSH_CUA_SCREENSHOTS) return
      await js(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
      await mkdir(process.env.DSH_CUA_SCREENSHOTS,{recursive:true})
      await writeFile(join(process.env.DSH_CUA_SCREENSHOTS,name+'.png'),(await window.webContents.capturePage()).toPNG())
    }
    await js(`document.activeElement.blur(); window.fixtureLocale('en')`)
    await capture('browser-light')
    const light = await js(`getComputedStyle(document.querySelector('.dsh-cua-browser')).backgroundColor`)
    await js(`document.body.setAttribute('data-ds-dark-theme',''); document.querySelector('#root').style.width='320px'`)
    assert.notEqual(await js(`getComputedStyle(document.querySelector('.dsh-cua-browser')).backgroundColor`),light)
    assert.equal(await js(`document.querySelector('.dsh-cua-browser').scrollWidth <= 320 && document.querySelector('.cua-address-row').getBoundingClientRect().width <= 320`),true)
    await capture('browser-dark-narrow')
    await js(`document.querySelectorAll('.cua-close')[1].focus(); document.querySelectorAll('.cua-close')[1].click()`)
    assert.equal(await js(`document.querySelectorAll('webview').length`),1)
    assert.equal(await js(`document.activeElement === document.querySelector('.cua-select')`),true)
    assert.equal(await js(`document.querySelector('webview') === window.firstGuest`),true)
    assert.deepEqual((await call({action:'list'})).structuredContent.tabs.map(tab=>tab.target),[target])
    // Closing the selected tab reveals a survivor without recreating either guest.
    await call({action:'open',url:`http://127.0.0.1:${server.address().port}/third`,visible:true})
    await js(`document.querySelectorAll('.cua-close')[1].click()`)
    assert.equal(await js(`window.firstGuest.style.display !== 'none'`),true)
    broker.release(owner)
    await new Promise(r=>setTimeout(r,1200))
    assert.equal(await window.webContents.executeJavaScript('document.querySelectorAll("webview").length'),0)
    assert.equal(await js(`document.querySelector('.cua-empty').hidden`),false)
    assert.equal(await js(`document.querySelector('.cua-address-row').hidden`),true)
    await js(`window.fixtureLocale('zh')`)
    assert.match(await js(`document.querySelector('.cua-empty').textContent`),/暂无打开的网页/)
    await capture('browser-empty-zh')
    await writeFile(join(process.cwd(),'evidence/host-browser-report.json'),JSON.stringify({passed:true,plugin:JSON.parse(await readFile(join(process.cwd(),'package.json'),'utf8')).version,harness:'0.2.0-rc.2',electron:process.versions.electron,checks:['actual plugin React client','unmodified DSH browser lease and preload bridge','open and observe','DOM fill and click verified by page state','explicit screenshot','cross-owner target rejected','owner reset removes guest', 'tab switching preserves guest and page state', 'read-only address and selection preservation', 'long titles and 320px pane', 'stock light/dark theme tokens', 'live English/Chinese chrome labels', 'closing active/inactive tabs and focus restoration', 'localized empty state'],limits:['fixture mounts client with a minimal sidebar and locale adapters; installed Desktop plugin activation not covered','DOM operations are not trusted keyboard/mouse input','live PiP not implemented']},null,2)+'\n')
    console.log('Host browser client fixture passed')
  } finally { broker.dispose();window.destroy();server.closeAllConnections();server.close();clearTimeout(deadline);await rm(profile,{recursive:true,force:true}) }
}
void run().then(()=>app.exit(0),error=>{console.error(error);app.exit(1)})
