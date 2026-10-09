import {spawn} from 'node:child_process';
import {resolve,join} from 'node:path';
import {rm,readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
/** A stale report or a zero-code crash without completed assertions cannot pass. */
export async function runElectron(entry,report,extra={}){
  const output=process.env.DSH_CUA_TEST_OUTPUT||resolve('evidence');
  await rm(join(output,report),{force:true});
  const executable=process.env.DSH_CUA_TEST_ELECTRON||createRequire(import.meta.url)('electron');
  const env={...process.env,...extra,DSH_CUA_TEST_OUTPUT:output};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(executable,[entry],{env,stdio:'inherit'});
  const timeout=setTimeout(()=>child.kill('SIGKILL'),90000);
  try{
    const code=await new Promise((resolve,reject)=>{child.once('exit',(code)=>resolve(code));child.once('error',reject);});
    if(code!==0)throw new Error(`Electron test exited with ${code}`);
    if(JSON.parse(await readFile(join(output,report),'utf8')).passed!==true)throw new Error('Test report failed');
  }finally{clearTimeout(timeout);}
}
