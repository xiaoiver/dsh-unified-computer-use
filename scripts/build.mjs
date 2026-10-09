import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
await build({entryPoints:['src/index.ts'],outdir:'dist',bundle:true,loader:{'.md':'text'},packages:'external',platform:'node',format:'esm',target:'node22',sourcemap:true});

const client = await build({entryPoints:['src/client.ts'],bundle:true,loader:{'.md':'text'},external:['react','@deepseek-ai/dsh-client-ui-primitives'],platform:'browser',format:'cjs',target:'es2022',write:false});
await writeFile('dist/client.js', 'window.__ModuleLoader__.load({id:"dsh-unified-computer-use",factory:(require)=>{var module={exports:{}};var exports=module.exports;\n'+client.outputFiles[0].text+'\nreturn module.exports;}});\n');

await build({entryPoints:['src/repl-worker.ts'],outfile:'dist/repl-worker.js',bundle:true,external:['zod'],loader:{'.md':'text'},platform:'node',format:'esm',target:'node22',sourcemap:true});
