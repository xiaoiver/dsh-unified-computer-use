import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { ReplHost } from '../src/repl-host.ts'
import { result } from '../src/protocol.ts'

// Process fixture tests the real interpreter/transport; OS enforcement is tested separately with stock DSH.
function fixture(dispatch: ConstructorParameters<typeof ReplHost>[2] = async () => result({ ok: true })) {
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
  const host = new ReplHost(context, { mode: 'read-only', workspaceRoot: process.cwd() }, dispatch, fileURLToPath(new URL('../dist/repl-worker.js', import.meta.url)))
  return { host, children, confined: () => confined }
}
const evaluate = (host: ReplHost, code: string) => host.evaluate(code, AbortSignal.timeout(5000))
const text = (value: Awaited<ReturnType<ReplHost['evaluate']>>) => JSON.stringify(value.content)

test('REPL persists lexical variables and top-level await; instances isolate state and startup environment', async () => {
  const a = fixture(), b = fixture()
  try {
    assert.equal((await evaluate(a.host, 'let count = 1; await Promise.resolve(); count')).isError, undefined)
    assert.match(text(await evaluate(a.host, '++count')), /2/)
    assert.match(text(await evaluate(b.host, 'typeof count')), /undefined/)
    assert.match(text(await evaluate(a.host, 'Object.keys(process.env)')), /\[\]/)
    assert.equal(a.children.length, 1); assert.equal(a.confined(), 1)
  } finally { await a.host.dispose(); await b.host.dispose() }
})

test('REPL capability bindings return data, wait for admitted calls, and reject stale async callbacks', async () => {
  let calls = 0
  const a = fixture(async () => { calls++; await new Promise(r => setTimeout(r, 20)); return result({ apps: [] }) })
  try {
    assert.match(text(await evaluate(a.host, 'const response = await cua.getState(); nodeRepl.write(response)')), /apps/)
    await evaluate(a.host, 'void cua.getState()')
    assert.equal(calls, 2)
    await evaluate(a.host, 'setTimeout(() => cua.getState().catch(() => {}), 80); undefined')
    await evaluate(a.host, 'await new Promise(r => setTimeout(r, 150)); 1')
    assert.equal(calls, 2)
  } finally { await a.host.dispose() }
})

test('REPL syntax/runtime errors are readable and do not discard earlier variables', async () => {
  const a = fixture()
  try {
    await evaluate(a.host, 'let saved = 7')
    const failure = await evaluate(a.host, 'throw new Error("example failure")')
    assert.equal(failure.isError, true); assert.match(text(failure), /example failure/)
    assert.match(text(await evaluate(a.host, 'saved')), /7/)
  } finally { await a.host.dispose() }
})

test('REPL infinite-loop timeout terminates the worker and cannot be reused', async () => {
  const a = fixture()
  try {
    await evaluate(a.host, 'let value = 1')
    await assert.rejects(a.host.evaluate('while (true) {}', AbortSignal.timeout(100)), /canceled|timed out|aborted/i)
    assert.equal(a.host.closed, true)
    await assert.rejects(evaluate(a.host, 'value'), /reset/)
    assert.ok(a.children.every(child => child.exitCode !== null || child.signalCode !== null))
  } finally { await a.host.dispose() }
})

test('REPL output limit fails closed and disposes the process', async () => {
  const a = fixture()
  try {
    await assert.rejects(evaluate(a.host, 'for (let i=0;i<200;i++) nodeRepl.write("x".repeat(32768))'), /exceeds|exited|closed/)
    assert.equal(a.host.closed, true)
  } finally { await a.host.dispose() }
})
