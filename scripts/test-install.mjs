/** Verify install + activation + tool execution with an unmodified npm DSH CLI. */
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile,rm,realpath,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const cli=process.env.DSH_CLI,cache=process.env.DSH_CUA_RUNTIME_DIR;
if(!cli||!cache)throw Error('Set DSH_CLI to a stock rc.2 executable and DSH_CUA_RUNTIME_DIR to a test cache; pnpm must be on PATH');
const executable=await realpath(cli),scratch=await mkdtemp(join(tmpdir(),'dsh-cua-install-'));
const env={...process.env,DSH_HOME:join(scratch,'home'),DSH_CUA_ACCEPTANCE_REPORT:resolve('evidence/installed-bundle-report.json')};
await mkdir('evidence',{recursive:true});await rm(env.DSH_CUA_ACCEPTANCE_REPORT,{force:true});
const run=async(args,quiet=false)=>{
  let output='';
  const child=spawn(executable,args,{env,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',chunk=>{output+=chunk;if(!quiet)process.stdout.write(chunk);});
  child.stderr.on('data',chunk=>{if(!quiet)process.stderr.write(chunk);});
  const timeout=setTimeout(()=>child.kill('SIGTERM'),180000);
  try{const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});if(code!==0)throw Error(`DSH exited with ${code}`);return output;}finally{clearTimeout(timeout);}
};
try{
  let spec=process.env.DSH_CUA_INSTALL_SPEC;
  if(!spec){const packed=await promisify(execFile)('npm',['pack','--ignore-scripts','--json','--pack-destination',scratch]);spec=join(scratch,JSON.parse(packed.stdout)[0].filename);}
  await run(['plugin','--profile','cua-test','add',spec]);
  const config=await run(['--profile','cua-test','--dump-config'],true);
  if(!config.includes('# == dsh-unified-computer-use'))throw Error('Bundle was not activated');
  const require=createRequire(executable);
  let fixture=await readFile('test/installed-bundle.mjs','utf8');
  for(const name of ['@deepseek-ai/dsh-llm','@deepseek-ai/dsh-session'])fixture=fixture.replace(JSON.stringify(name).replaceAll('"',"'"),JSON.stringify(pathToFileURL(require.resolve(name)).href));
  const fixturePath=join(scratch,'acceptance.mjs');await writeFile(fixturePath,fixture);
  const patch=join(scratch,'acceptance.yml');await writeFile(patch,JSON.stringify([{id:'unified-computer-use',config:{approval:'ask',native:false,pip:true,runtimeDirectory:resolve(cache)}},{insert:[{id:'install-acceptance',name:fixturePath}]}]));
  await run(['--profile','cua-test','--patch',patch]);
  const report=JSON.parse(await readFile(env.DSH_CUA_ACCEPTANCE_REPORT,'utf8'));
  if(report.passed!==true)throw Error('Installed plugin acceptance failed');
  report.installSource=process.env.DSH_CUA_INSTALL_SPEC||'local npm pack tarball';
  await writeFile(env.DSH_CUA_ACCEPTANCE_REPORT,JSON.stringify(report,null,2)+'\n');
}finally{await rm(scratch,{recursive:true,force:true});}
