import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { readFile,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
export const inject=['tools','agents','llm','settings'];
class Fixture extends LlmAdapter { async *stream(){throw Error('No LLM request expected');} }
export function apply(ctx){
 const deadline=setTimeout(()=>{console.error('Settings acceptance timed out');process.exit(1)},30000);
 void(async()=>{
  const get=()=>ctx.settings.describe().find(row=>row.ns==='unified-computer-use');
  for(let n=0;!get();n++){if(n>100)throw Error('Editable plugin settings did not appear');await new Promise(r=>setTimeout(r,50));}
  const expected={native:false,timeoutMs:12000,idleTimeoutMs:45000,maxTargets:3};
  if(process.env.DSH_CUA_SETTINGS_PHASE==='verify'){
   assert.deepEqual(get().value,expected);
   const report=JSON.parse(await readFile(process.env.DSH_CUA_ACCEPTANCE_REPORT,'utf8'));report.checks.push('Accepted settings survive a full stock DSH restart');report.passed=true;
   await writeFile(process.env.DSH_CUA_ACCEPTANCE_REPORT,JSON.stringify(report,null,2)+'\n');clearTimeout(deadline);console.log('Settings restart acceptance passed');process.exit(0);
  }
  assert.deepEqual(get().value,{native:true,timeoutMs:30000,idleTimeoutMs:600000,maxTargets:12});
  ctx.llm.registerAdapter(['settings-fixture'],new Fixture());
  const owner=await ctx.agents.create({sessionId:SessionId('settings-fixture'),agentOptions:{provider:'settings-fixture',model:'fixture'}});
  owner.agent.session.append('turn/start',{turn:1});
  let approvals=0,seq=0;
  ctx.on('approval/request',async()=>{approvals++;return 'allowed-once'},true);
  const run=code=>ctx.tools.execute({name:'cua_repl',arguments:{code},agent:owner.agent,callId:ToolCallId('settings-'+ ++seq),signal:AbortSignal.timeout(10000)});
  const mutate=values=>ctx.settings.mutate('unified-computer-use',Object.entries(values).map(([key,value])=>({op:'set',path:[key],value})),get().revision);
  try{
   const first=await run('let settingsCount = 1; settingsCount');assert.equal(first.isError,false,JSON.stringify(first));assert.equal(approvals,0);
   const stale=get().revision;
   await mutate(expected);
   const second=await run('++settingsCount');assert.equal(second.isError,false,JSON.stringify(second));assert.match(JSON.stringify(second),/2/);assert.equal(approvals,0);
   const disabled=await run('await cua.native({action:"permissions"})');assert.equal(disabled.isError,true);assert.match(JSON.stringify(disabled),/Native Computer Use is disabled/);
   await assert.rejects(ctx.settings.mutate('unified-computer-use',[{op:'set',path:['native'],value:true}],stale),/changed|revision/i);
   await assert.rejects(mutate({timeoutMs:0}));assert.deepEqual(get().value,expected);
   const stop=ctx.on('tools/pre-execute',async(execution,next)=>execution.name==='cua_repl'?{kind:'deny',reason:'fixture downstream denial'}:next(),true);
   const denied=await run('settingsCount');assert.equal(denied.isError,true);stop();assert.equal(approvals,0);
   const ask=ctx.on('tools/pre-execute',async(execution,next)=>execution.name==='cua_repl'?{kind:'ask',reason:'fixture DSH policy'}:next(),true);
   assert.equal((await run('settingsCount')).isError,false);assert.equal(approvals,1);ask();
   assert.equal((await run('settingsCount')).isError,false);assert.equal(approvals,1);
   assert.deepEqual(get().value,expected);
   assert.match(await readFile(ctx.settings.documentPath,'utf8'),/45000/);
   await owner.dispose();
   await writeFile(process.env.DSH_CUA_ACCEPTANCE_REPORT,JSON.stringify({passed:false,harness:'0.2.0-rc.2',node:process.version,electron:process.versions.electron??null,checks:['Four fields exposed by real DSH settings schema; no approval field','Settings mutate preserves REPL state; allowed calls add no plugin approval','Native toggle immediately rejects SDK access','Stale revision and invalid values rejected','DSH deny policy prevents execution','DSH ask policy requests approval; returning to allow adds no extra approval','User settings persisted to isolated profile patch'],limits:['Programmatic stock settings test; Desktop form visual verification is separate']},null,2)+'\n');
   clearTimeout(deadline);console.log('Live settings acceptance passed');process.exit(0);
  }finally{await owner.dispose()}
 })().catch(error=>{console.error(error);clearTimeout(deadline);process.exit(1)});
}
