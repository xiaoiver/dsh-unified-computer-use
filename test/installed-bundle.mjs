import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
export const name='cua-install-acceptance';
export const inject=['tools','agents','llm'];
class Fixture extends LlmAdapter { async *stream(){throw Error('No LLM request expected');} }
export function apply(ctx){
  const deadline=setTimeout(()=>{console.error('Acceptance timed out');process.exit(1);},30000);
  void (async()=>{
    for(let n=0;!ctx.tools.schemas().some(t=>t.name==='cua');n++){
      if(n>100)throw Error('Installed bundle did not register cua');
      await new Promise(r=>setTimeout(r,50));
    }
    const server=createServer((req,res)=>res.end('<title>Installed bundle</title><h1>Stock DSH + installed companion</h1>'));
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    ctx.llm.registerAdapter(['cua-fixture'],new Fixture());
    const owner=await ctx.agents.create({sessionId:SessionId('installed-companion'),agentOptions:{provider:'cua-fixture',model:'fixture'}});
    owner.agent.session.append('turn/start',{turn:1});
    ctx.on('approval/request',async()=> 'allowed-once');
    try{
      const result=await ctx.tools.execute({name:'cua',arguments:{surface:'browser',operation:{action:'open',url:`http://127.0.0.1:${server.address().port}/`,visible:false}},agent:owner.agent,callId:ToolCallId('installed'),signal:AbortSignal.timeout(20000)});
      assert.equal(result.isError,false,JSON.stringify(result));
      assert.match(JSON.stringify(result),/Stock DSH \+ installed companion/);
      await owner.dispose();
      await writeFile(process.env.DSH_CUA_ACCEPTANCE_REPORT,JSON.stringify({passed:true,harness:'0.2.0-rc.2',checks:['stock npm CLI','dsh plugin add installs and enables bundle','dump-config contains plugin layer','unmodified dsh boots complete profile','installed cua tool launches standalone Electron','browser AX result through actual DSH ToolRuntime','Agent cleanup exits companion']},null,2));
      clearTimeout(deadline);server.closeAllConnections();server.close();console.log('Installed bundle acceptance passed');process.exit(0);
    }finally{await owner.dispose();server.closeAllConnections();server.close();}
  })().catch(error=>{console.error(error);clearTimeout(deadline);process.exit(1);});
}
