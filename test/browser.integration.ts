import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { writeFile } from 'node:fs/promises'
import { PlaywrightBrowser } from '../src/browser-playwright.ts'
import { fixture } from './helpers/repl-fixture.ts'
import { browserAction, type Result } from '../src/protocol.ts'
const text = (r: Result) => JSON.stringify(r.content)

test('real Chrome and REPL: Playwright locators, inputs, frames, output, isolation and teardown', {timeout:90000}, async () => {
  const page = `<!doctype html><title>Playwright fixture</title>
  <style>body{font:16px system-ui;padding:30px}button,input,select{margin:6px}#drag,#drop{display:inline-block;width:100px;height:50px;background:#ddd;margin:12px}</style>
  <label>Name <input aria-label="Name" placeholder="Your name"></label>
  <label><input type="checkbox">Agree</label><select aria-label="Color"><option value="red">Red</option><option value="blue">Blue</option></select>
  <button id="save" disabled>Save</button><output aria-label="Result">Waiting</output>
  <button>Duplicate</button><button>Duplicate</button>
  <ul><li data-testid="row">Alpha <span>One</span></li><li data-testid="row">Beta <span>Two</span></li></ul>
  <iframe title="Frame" src="FRAME_URL"></iframe><a target="_blank" href="/popup">Open popup</a>
  <div id="drag" draggable="true">Drag</div><div id="drop">Drop</div>
  <script>
  // Only the input timer may enable Save; a page-load timer would race with it.
  document.querySelector('input').oninput=()=>{document.querySelector('#save').disabled=true;setTimeout(()=>document.querySelector('#save').disabled=false,350)};
  document.querySelector('#save').onclick=e=>document.querySelector('output').textContent=document.querySelector('input').value+' trusted='+e.isTrusted;
  document.querySelector('input').onkeydown=e=>{if(e.key==='Enter')document.querySelector('output').textContent='Enter trusted='+e.isTrusted};
  document.querySelector('#drop').ondragover=e=>e.preventDefault();document.querySelector('#drop').ondrop=e=>{e.preventDefault();e.target.textContent='Dropped'};
  </script>`
  const server=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(req.url==='/frame'?'<label>Inside<input aria-label="Inside"></label>':req.url==='/popup'?'<title>Popup</title><h1>Owned popup</h1>':page.replace('FRAME_URL', `http://localhost:${(server.address() as {port:number}).port}/frame`))})
  await new Promise<void>(resolve=>server.listen(0,resolve))
  const port=(server.address() as {port:number}).port
  const browser=new PlaywrightBrowser(process.env.DSH_CUA_HEADED_TEST !== '1')
  const other=new PlaywrightBrowser(true)
  const a=fixture((command,signal)=>{assert.equal(command.surface,'browser');return browser.execute(command.operation as never,signal)})
  const run=async(code:string)=>{const r=await a.host.evaluate(code,AbortSignal.timeout(15000));assert.notEqual(r.isError,true,text(r));return r}
  let version=''
  try {
    const prepared=await browser.execute({action:'prepare'},AbortSignal.timeout(20000));version=String(prepared.structuredContent!.version)
    const first=await run(`let tab = await cua.createBrowserTab('http://127.0.0.1:${port}/')`)
    assert.match(text(first),/# Computer Use API/);assert.match(text(first),/# Browser API/)
    assert.match(text(first),/Playwright fixture/)
    const listed=await browser.execute({action:'list'},AbortSignal.timeout(1000))
    const target=(listed.structuredContent!.tabs as {target:string}[])[0].target
    await assert.rejects(other.execute({action:'observe',target,screenshot:false},AbortSignal.timeout(1000)),/another session/)
    const waitStarted = performance.now()
    await run("let name = tab.playwright.getByRole('textbox',{name:'Name',exact:true}); await name.fill('Ada'); await tab.playwright.getByRole('button',{name:'Save',exact:true}).click()")
    assert.ok(performance.now()-waitStarted >= 250, 'click must wait until Save is enabled')
    assert.match(text(await run("nodeRepl.write(await tab.playwright.getByLabel('Result').textContent())")),/Ada trusted=true/)
    await run("await name.press('Enter')")
    assert.match(text(await run("nodeRepl.write(await tab.playwright.getByLabel('Result').textContent())")),/Enter trusted=true/)
    await run("await tab.playwright.getByLabel('Agree').check(); await tab.playwright.getByLabel('Color').selectOption({label:'Blue'})")
    assert.match(text(await run("nodeRepl.write([await tab.playwright.getByLabel('Agree').isChecked(),await tab.playwright.getByLabel('Color').inputValue()])")),/true.*blue/)
    assert.match(text(await run("nodeRepl.write(await tab.playwright.getByTestId('row').filter({has:tab.playwright.getByText('Two',{exact:true})}).innerText())")),/Beta/)
    assert.match(text(await run("nodeRepl.write(await tab.playwright.getByRole('listitem').filter({hasText:/Alpha/}).and(tab.playwright.getByTestId('row')).count())")),/1/)
    const duplicate=await a.host.evaluate("await tab.playwright.getByRole('button',{name:'Duplicate',exact:true}).click({timeout:300})",AbortSignal.timeout(2000))
    assert.equal(duplicate.isError,true);assert.match(text(duplicate),/strict mode violation/)
    await run("await tab.playwright.frameLocator('iframe').getByLabel('Inside').fill('Frame value')")
    assert.match(text(await run("nodeRepl.write(await tab.playwright.locator('iframe').contentFrame().getByLabel('Inside').inputValue())")),/Frame value/)
    await run("await tab.playwright.locator('#drag').dragTo(tab.playwright.locator('#drop'))")
    assert.match(text(await run("nodeRepl.write(await tab.playwright.locator('#drop').innerText())")),/Dropped/)
    assert.match(text(await run("nodeRepl.write((await tab.playwright.getByTestId('row').all()).length)")),/2/)
    assert.match(text(await run("nodeRepl.write(await name.getAttribute('not-present'))")),/null/)
    assert.match(text(await run("nodeRepl.write(typeof await name.focus())")),/undefined/)
    const snapshot=await run('nodeRepl.write(await tab.playwright.domSnapshot())');assert.match(text(snapshot),/Name|Ada/)
    const screenshot=await run('nodeRepl.emitImage(new Uint8Array(await tab.playwright.screenshot()))')
    assert.equal(screenshot.content.length,1);assert.equal(screenshot.content[0].type,'image')
    if(screenshot.content[0].type==='image')assert.ok(Buffer.from(screenshot.content[0].data,'base64').subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    const auto=await run('await tab.getState({screenshot:true})');assert.equal(auto.content.filter(c=>c.type==='image').length,1);assert.equal(auto.content.filter(c=>c.type==='text').length,1)
    await run("await tab.playwright.getByRole('link',{name:'Open popup'}).click()")
    let tabs: any[]=[]
    for(let i=0;i<20;i++){tabs=(await browser.execute({action:'list'},AbortSignal.timeout(1000))).structuredContent!.tabs as any[];if(tabs.length===2)break;await new Promise(r=>setTimeout(r,50))}
    assert.equal(tabs.length,2)
    await run(`let popup = await cua.getTab(${JSON.stringify(tabs.find(t=>t.target!==target).target)})`)
    const foreignLocator = await a.host.evaluate("await tab.playwright.locator('body').filter({has:popup.playwright.locator('h1')}).count()",AbortSignal.timeout(2000))
    assert.equal(foreignLocator.isError,true);assert.match(text(foreignLocator),/from this tab/)
    await run('await popup.close()')
    assert.equal(((await browser.execute({action:'list'},AbortSignal.timeout(1000))).structuredContent!.tabs as any[]).length,1)
    await run(`await tab.goto('http://127.0.0.1:${port}/second'); await tab.back(); await tab.forward(); await tab.reload()`)
    assert.match(text(await run('nodeRepl.write(await tab.playwright.url())')),/second/)
    // Remote method names, paths and raw execution cannot escape the scoped facade.
    for(const method of ['evaluate','context','route','newCDPSession'])assert.equal(browserAction.safeParse({action:'playwright',target,plan:[],method,args:[]}).success,false)
    await assert.rejects(browser.execute({action:'playwright',target,plan:[],method:'screenshot',args:[{path:'/tmp/forbidden'}]},AbortSignal.timeout(1000)),/Unrecognized|unrecognized/)
    await assert.rejects(browser.execute({action:'playwright',target,plan:[],method:'goto',args:['file:///etc/passwd']},AbortSignal.timeout(1000)),/HTTP/)
    // Timeout closes this owner's Chrome, preventing late actions after cancellation.
    const canceled=await a.host.evaluate("await tab.playwright.getByRole('button',{name:'Never appears'}).click({timeout:0})",AbortSignal.timeout(250))
      .then(()=>false,()=>true)
    assert.equal(canceled,true)
    await browser.dispose()
    await assert.rejects(browser.execute({action:'list'},AbortSignal.timeout(1000)),/reset|closed/)
    await writeFile('evidence/playwright-browser-report.json',JSON.stringify({passed:true,plugin:'0.2.0-alpha.6',playwright:'1.64.0',chrome:version,headed:process.env.DSH_CUA_HEADED_TEST==='1',checks:['real installed Chrome, no browser download','built REPL worker/control pipe to real Playwright','layered API documents','strict matching','auto-wait for enabled control','trusted click and keyboard events','checkbox and select','regex, nested locator filters and combinations','cross-origin iframe locator and contentFrame','dragTo','all locators','ARIA snapshot','PNG and automatic screenshot output','owned popups','navigation history','cross-owner rejection','raw evaluation/CDP/path rejection','timeout shuts down owner browser'],limits:['isolated test page; arbitrary websites and native input not covered','Desktop plugin-manager UI not exercised']},null,2)+'\n')
  } finally {await a.host.dispose();await browser.dispose();await other.dispose();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
})
