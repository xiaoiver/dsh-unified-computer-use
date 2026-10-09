import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
export const name='cua-host-install-acceptance';
export const inject=['tools','agents','llm','sandboxPolicy'];
class Fixture extends LlmAdapter { async *stream(){throw Error('No LLM request expected');} }
export function apply(ctx){
  const deadline=setTimeout(()=>{console.error('Acceptance timed out');process.exit(1);},45000);
  void (async()=>{
    for(let n=0;!ctx.tools.schemas().some(t=>t.name==='cua_repl');n++){
      if(n>100)throw Error('Installed bundle did not register cua_repl');
      await new Promise(r=>setTimeout(r,50));
    }
    ctx.llm.registerAdapter(['cua-fixture'],new Fixture());
    const owner=await ctx.agents.create({sessionId:SessionId('installed-host'),agentOptions:{provider:'cua-fixture',model:'fixture'}});
    owner.agent.session.append('turn/start',{turn:1});
    // Fixture-owned DSH policy exercises approval without plugin-specific hooks.
    if(process.env.DSH_CUA_TEST_PROFILE!=='web')ctx.on('tools/pre-execute',async(execution,next)=>execution.name==='cua_repl'?{kind:'ask',reason:'fixture DSH policy'}:next(),true);
    let allowed=false, approvals=0;
    ctx.on('approval/request',async()=> {approvals++;return allowed?'allowed-once':'rejected'});
    let seq=0;
    const run=(code,timeout_ms=10000)=>ctx.tools.execute({name:'cua_repl',arguments:{code,timeout_ms},agent:owner.agent,callId:ToolCallId('host-'+ ++seq),signal:AbortSignal.timeout(15000)});
    try{
      if(process.env.DSH_CUA_TEST_PROFILE!=='web'){const denied=await run('let denied = true');assert.equal(denied.isError,true);}
      allowed=true;
      const first=await run('let count = 41; await Promise.resolve(); ++count');
      assert.equal(first.isError,false,JSON.stringify(first));assert.match(JSON.stringify(first),/42/);assert.match(JSON.stringify(first),/# Computer Use API/);
      const second=await run('++count');assert.equal(second.isError,false,JSON.stringify(second));assert.match(JSON.stringify(second),/43/);assert.doesNotMatch(JSON.stringify(second),/# Computer Use API/);
      const docs=await run('await cua.rewriteDocumentation()');assert.equal(docs.isError,false,JSON.stringify(docs));assert.match(JSON.stringify(docs),/# Computer Use API/);assert.doesNotMatch(JSON.stringify(docs),/# Browser API/);
      const error=await run('throw new Error("readable failure")');assert.equal(error.isError,true);assert.match(JSON.stringify(error),/readable failure/);
      const permissions=await run('nodeRepl.write(await cua.native({action:"permissions"}))');assert.equal(permissions.isError,false,JSON.stringify(permissions));
      const timeout=await run('while(true){}',1000);assert.equal(timeout.isError,true);assert.match(JSON.stringify(timeout),/timed out|timeout/i);
      const reset=await run('typeof count');assert.equal(reset.isError,false,JSON.stringify(reset));assert.match(JSON.stringify(reset),/undefined/);assert.match(JSON.stringify(reset),/# Computer Use API/);
      const explicitReset=await ctx.tools.execute({name:'cua_repl_reset',arguments:{},agent:owner.agent,callId:ToolCallId('reset-'+ ++seq),signal:AbortSignal.timeout(10000)});assert.equal(explicitReset.isError,false);
      const afterReset=await run('await cua.rewriteDocumentation()');assert.match(JSON.stringify(afterReset),/# Computer Use API/);
      if(process.env.DSH_CUA_CHROME_TEST==='1'){
        const server=createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end('<title>Installed Playwright</title><label>Message<input></label><button onclick="document.querySelector(\'output\').textContent=document.querySelector(\'input\').value">Save</button><output>Waiting</output>')});
        await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
        try{
          const browser=await run(`let tab = await cua.createBrowserTab('http://127.0.0.1:${server.address().port}/')`);
          assert.equal(browser.isError,false,JSON.stringify(browser));assert.match(JSON.stringify(browser),/# Browser API/);
          const edited=await run("await tab.playwright.getByRole('textbox',{name:'Message'}).fill('Installed Chrome passed'); await tab.playwright.getByRole('button',{name:'Save'}).click(); nodeRepl.write(await tab.playwright.locator('output').innerText())");
          assert.equal(edited.isError,false,JSON.stringify(edited));assert.match(JSON.stringify(edited),/Installed Chrome passed/);
          const image=await run('nodeRepl.emitImage(await tab.playwright.screenshot())');assert.equal(image.isError,false,JSON.stringify(image));assert.ok(JSON.stringify(image).includes('image/png'));
          const canceled=await run("await tab.playwright.getByRole('button',{name:'Never appears'}).click({timeout:0})",1000);assert.equal(canceled.isError,true);
          const empty=await run('await cua.listTabs()');assert.equal(empty.isError,false,JSON.stringify(empty));assert.match(JSON.stringify(empty),/tabs: \[\]/);
        }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
      }
      setSandboxMode(owner.agent.session,'read-only');
      const changed=await run('1');assert.equal(changed.isError,true);assert.match(JSON.stringify(changed),/policy changed/);
      const forbidden=await run(`await (await import('node:fs/promises')).writeFile(${JSON.stringify(process.env.DSH_CUA_DENIED_PATH)}, 'forbidden')`);assert.equal(forbidden.isError,true,JSON.stringify(forbidden));assert.match(JSON.stringify(forbidden),/EPERM|EACCES|denied/);
      const policy=ctx.sandboxPolicy.resolve({session:owner.agent.session});
      await owner.dispose();
      await writeFile(process.env.DSH_CUA_ACCEPTANCE_REPORT,JSON.stringify({passed:true,harness:'0.2.0-rc.2',profile:process.env.DSH_CUA_TEST_PROFILE||'cua-test',node:process.version,electron:process.versions.electron??null,sandboxMode:policy.mode,approvals,checks:['stock npm CLI bundle install and activation',...(process.env.DSH_CUA_TEST_PROFILE==='web'?['stock Web profile activation without Desktop bridge']:['actual DSH ToolRuntime approval denial']),'persistent lexical state and top-level await','readable runtime exceptions','native SDK permission query without prompting','infinite-loop deadline terminates process','fresh REPL after timeout','common API delivered once per interpreter','documentation reread without target access','documentation reintroduced after timeout and explicit reset','sandbox policy change resets previous state','read-only file write denied by stock sandbox','Agent teardown',...process.env.DSH_CUA_CHROME_TEST==='1'?['real installed Chrome launched from stock DSH','Playwright locator fill and click','Playwright PNG output','browser cancellation resets interpreter and tabs']:[]],limits:['Desktop client installation not covered by this fixture','native input and independent live PiP not tested']},null,2));
      clearTimeout(deadline);console.log('Installed host bundle acceptance passed');process.exit(0);
    }finally{await owner.dispose();}
  })().catch(error=>{console.error(error);clearTimeout(deadline);process.exit(1);});
}
