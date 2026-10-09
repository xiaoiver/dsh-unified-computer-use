import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy';
import { writeFile } from 'node:fs/promises';
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
      if(process.env.DSH_CUA_TEST_PROFILE==='web'){
        for(let n=0;!ctx.get('connection');n++){if(n>100)throw Error('Web connection never became ready');await new Promise(r=>setTimeout(r,50));}
        console.log('web services:',!!ctx.get('connection'),!!ctx.get('webServer'));
        const probe=await run('await cua.browser({action:"list"})',1000);console.log('browser diagnostic:',JSON.stringify(probe));
        assert.doesNotMatch(JSON.stringify(probe),/client connection is unavailable/);
      }
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
      setSandboxMode(owner.agent.session,'read-only');
      const changed=await run('1');assert.equal(changed.isError,true);assert.match(JSON.stringify(changed),/policy changed/);
      const forbidden=await run(`await (await import('node:fs/promises')).writeFile(${JSON.stringify(process.env.DSH_CUA_DENIED_PATH)}, 'forbidden')`);assert.equal(forbidden.isError,true,JSON.stringify(forbidden));assert.match(JSON.stringify(forbidden),/EPERM|EACCES|denied/);
      const policy=ctx.sandboxPolicy.resolve({session:owner.agent.session});
      await owner.dispose();
      await writeFile(process.env.DSH_CUA_ACCEPTANCE_REPORT,JSON.stringify({passed:true,harness:'0.2.0-rc.2',profile:process.env.DSH_CUA_TEST_PROFILE||'cua-test',node:process.version,electron:process.versions.electron??null,sandboxMode:policy.mode,approvals,checks:['stock npm CLI bundle install and activation',...(process.env.DSH_CUA_TEST_PROFILE==='web'?['Browser bridge registers beside the full web gateway']:['actual DSH ToolRuntime approval denial']),'persistent lexical state and top-level await','readable runtime exceptions','native SDK permission query without prompting','infinite-loop deadline terminates process','fresh REPL after timeout','common API delivered once per interpreter','documentation reread without target access','documentation reintroduced after timeout and explicit reset','sandbox policy change resets previous state','read-only file write denied by stock sandbox','Agent teardown'],limits:['Desktop client installation not covered by this fixture','native input and independent live PiP not tested']},null,2));
      clearTimeout(deadline);console.log('Installed host bundle acceptance passed');process.exit(0);
    }finally{await owner.dispose();}
  })().catch(error=>{console.error(error);clearTimeout(deadline);process.exit(1);});
}
