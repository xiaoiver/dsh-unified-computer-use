import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { runElectron } from './test-runner.mjs';
await build({entryPoints:['test/electron.ts'],outfile:'dist/test-electron.mjs',bundle:true,packages:'external',platform:'node',format:'esm',target:'node22'});
await runElectron('dist/test-electron.mjs','electron-report.json');
