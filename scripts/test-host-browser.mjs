import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
const source=process.env.DSH_SOURCE,electron=process.env.DSH_TEST_ELECTRON;
if(!source||!electron)throw Error('Set DSH_SOURCE to unmodified rc.2 source and DSH_TEST_ELECTRON to an existing Electron executable. This test does not download a runtime.');
const directory=await mkdtemp(join(tmpdir(),'dsh-client-fixture-build-'));
const alias={'stock-browser-guests':resolve(source,'apps/desktop/src/browser-guests.ts'),'stock-preload-browser':resolve(source,'apps/desktop/src/preload-browser.ts'),'stock-ipc':resolve(source,'apps/desktop/src/ipc.ts')};
try{
 await build({entryPoints:['test/host-browser/main.mts'],outfile:join(directory,'main.mjs'),bundle:true,platform:'node',format:'esm',external:['electron'],alias});
 await build({entryPoints:['test/host-browser/preload.mts'],outfile:join(directory,'preload.cjs'),bundle:true,platform:'node',format:'cjs',external:['electron'],alias});
 await build({entryPoints:['test/host-browser/renderer.mts'],outfile:join(directory,'renderer.js'),bundle:true,platform:'browser',format:'iife',plugins:[{name:'browser-only-settings',setup(build){build.onResolve({filter:/^\.\/settings-client\.ts$/},()=>({path:'settings',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function registerSettings() { throw new Error("Settings UI is verified separately in installed Desktop") }',loader:'js'}));}}]});
 const env={...process.env,DSH_CUA_BROWSER_FIXTURE:directory};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(electron,[join(directory,'main.mjs')],{env,stdio:'inherit'});
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});
 if(code!==0)throw Error('Browser fixture failed: '+code);
}finally{await rm(directory,{recursive:true,force:true});}
