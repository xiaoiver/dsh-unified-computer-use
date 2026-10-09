import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await build({entryPoints:['src/index.ts','src/desktop.ts','src/companion-main.ts'],outdir:'dist',bundle:true,packages:'external',platform:'node',format:'esm',target:'node22',sourcemap:true});
await build({entryPoints:['src/preload.ts'],outfile:'dist/preload.cjs',bundle:true,external:['electron'],platform:'node',format:'cjs',target:'node22'});
for(const name of ['browser.html','pip.html','views.css','browser-view.js','pip-view.js'])await copyFile('src/'+name,'dist/'+name);
