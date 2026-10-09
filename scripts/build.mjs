import { build } from 'esbuild';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await build({entryPoints:['src/index.ts','src/desktop.ts','src/companion-main.ts'],outdir:'dist',bundle:true,packages:'external',platform:'node',format:'esm',target:'node22',sourcemap:true});
await build({entryPoints:['src/preload.ts'],outfile:'dist/preload.cjs',bundle:true,external:['electron'],platform:'node',format:'cjs',target:'node22'});
for(const name of ['browser.html','pip.html','views.css','browser-view.js','pip-view.js'])await copyFile('src/'+name,'dist/'+name);

const client = await build({entryPoints:['src/client.ts'],bundle:true,external:['react'],platform:'browser',format:'cjs',target:'es2022',write:false});
await writeFile('dist/client.js', 'window.__ModuleLoader__.load({id:"dsh-unified-computer-use",factory:(require)=>{var module={exports:{}};var exports=module.exports;\n'+client.outputFiles[0].text+'\nreturn module.exports;}});\n');

await build({entryPoints:['src/repl-worker.ts'],outfile:'dist/repl-worker.js',bundle:true,platform:'node',format:'esm',target:'node22',sourcemap:true});
