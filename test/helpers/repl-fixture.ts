import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { ReplHost } from '../../src/repl-host.ts'
import { result } from '../../src/protocol.ts'

// Process fixture tests the real interpreter/transport; OS enforcement is tested separately with stock DSH.
export function fixture(dispatch: ConstructorParameters<typeof ReplHost>[2] = async () => result({ ok: true })) {
  const children: ReturnType<typeof spawn>[] = []
  let confined = 0
  const context = {
    fs: { processPathFromHostPath: (path: string) => path },
    sandbox: { confine: async (argv: string[]) => { confined++; return { argv } } },
    subprocess: {
      resolveExecutable: async () => process.execPath,
      spawn(spec: { argv: string[]; cwd: string; signal: AbortSignal; env: NodeJS.ProcessEnv }) {
        const child = spawn(spec.argv[0], spec.argv.slice(1), { cwd: spec.cwd, env: { ...spec.env, DSH_SUBPROCESS_CONTROL: 'pipe' }, stdio: ['ignore', 'pipe', 'pipe', 'ignore', 'ignore', 'ignore', 'ignore', 'pipe'] })
        children.push(child)
        const done = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => { child.once('error', reject); child.once('exit', (exitCode, signal) => resolve({ exitCode, signal })) })
        spec.signal.addEventListener('abort', () => child.kill('SIGKILL'), { once: true })
        return { stdout: child.stdout, stderr: child.stderr, control: (child.stdio as unknown[])[7], done, terminate: () => child.kill('SIGKILL'), waitForExit: async () => { await done; return true } }
      },
    },
  } as unknown as Pick<Context, 'subprocess' | 'sandbox' | 'fs'>
  const host = new ReplHost(context, { mode: 'read-only', workspaceRoot: process.cwd() }, dispatch, fileURLToPath(new URL('../../dist/repl-worker.js', import.meta.url)))
  return { host, children, confined: () => confined }
}
