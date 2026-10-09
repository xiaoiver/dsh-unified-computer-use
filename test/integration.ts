/** Stock DSH services call a plugin-owned Electron process, without any parent IPC. */
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { LlmAdapter, ToolCallId, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import Approval from '@deepseek-ai/dsh-user-approval'
const Plugin = await import(new URL('../dist/index.js', import.meta.url).href)
import { resultSchema, type Command } from '../src/protocol.ts'
import { writeFile, mkdir, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createServer } from 'node:http'
import assert from 'node:assert/strict'
class FixtureModel extends LlmAdapter { async *stream(): AsyncIterable<StreamChunk> { throw new Error('No LLM request expected') } }
const outputDirectory = resolve('evidence')
await mkdir(outputDirectory, { recursive: true })
const runtimeDirectory = process.env.DSH_CUA_RUNTIME_DIR
assert.ok(runtimeDirectory, 'Set DSH_CUA_RUNTIME_DIR to an isolated test cache')
assert.equal(process.send, undefined, 'This test must have no DSH parent IPC channel')
const server = createServer((_request, response) => {
  response.setHeader('content-type', 'text/html')
  response.end(`<title>Companion fixture</title><h1>Companion fixture</h1><label>Name <input aria-label="Name"></label><button onclick="document.querySelector('p').textContent='Saved '+document.querySelector('input').value">Save</button><p>Ready</p>`)
})
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
assert.ok(address && typeof address === 'object')
const fixtureUrl = `http://127.0.0.1:${address.port}/`
const ctx = new Context()
for (const plugin of [LlmRuntime, SessionStore, SessionProjections, SystemPrompt, ToolRuntime, AgentRegistry]) await ctx.plugin(plugin)
await ctx.plugin(AgentLoop, { agents: [] }); await ctx.plugin(Approval)
ctx.llm.registerAdapter(['fixture'], new FixtureModel())
const owner = await ctx.agents.create({ sessionId: SessionId('companion-integration'), agentOptions: { provider: 'fixture', model: 'fixture' } })
owner.agent.session.append('turn/start', { turn: 1 })
await ctx.plugin(Plugin, { approval: 'ask', timeoutMs: 10000, idleTimeoutMs: 30000, maxTargets: 4, native: false, pip: true, startupTimeoutMs: 180000, electronExecutable: '', runtimeDirectory })
let approvals = 0
ctx.on('approval/request', async () => { approvals++; return 'allowed-once' })
try {
  async function call(command: Command) {
    const output = await ctx.tools.execute({ name: 'cua', arguments: command, agent: owner.agent, callId: ToolCallId(`fixture-${approvals}`), signal: new AbortController().signal })
    assert.equal(output.isError, false, JSON.stringify(output))
    return resultSchema.parse(output.value)
  }
  const opened = await call({ surface: 'browser', operation: { action: 'open', url: fixtureUrl, visible: false } })
  const target = String(opened.structuredContent?.target)
  assert.match(JSON.stringify(opened), /Companion fixture/)
  function ref(value: import('../src/protocol.ts').Result, role: string) {
    const elements = value.structuredContent?.elements
    assert.ok(Array.isArray(elements))
    const element = elements.find(e => e && typeof e === 'object' && !Array.isArray(e) && e.role === role)
    assert.ok(element && typeof element === 'object' && !Array.isArray(element))
    return String(element.ref)
  }
  await call({ surface: 'browser', operation: { action: 'fill', target, ref: ref(opened, 'textbox'), text: 'No host patch' } })
  const observed = await call({ surface: 'browser', operation: { action: 'observe', target, screenshot: false } })
  await call({ surface: 'browser', operation: { action: 'click', target, ref: ref(observed, 'button') } })
  const after = await call({ surface: 'browser', operation: { action: 'observe', target, screenshot: false } })
  assert.match(JSON.stringify(after), /Saved No host patch/)
  await call({ surface: 'session', operation: 'reset' })
  await call({ surface: 'browser', operation: { action: 'open', url: fixtureUrl, visible: false } })
  assert.equal(approvals, 6)
  await owner.dispose(); await ctx.fiber.dispose()
  assert.deepEqual(await readdir(join(runtimeDirectory, 'sessions')), [])
  await writeFile(join(outputDirectory, 'companion-report.json'), JSON.stringify({ passed: true, electron: '44.7.0', harness: '0.2.0-rc.2', approvals, checks: ['no parent IPC or host patch', 'automatic checksum-verified runtime provisioning', 'real DSH approvals and ToolRuntime', 'plugin-owned Electron child', 'browser fill/click/result', 'reset stops child and reopens a fresh companion', 'Agent disposal removes session profiles'] }, null, 2))
  console.log('Unmodified DSH services + standalone companion integration passed')
} finally { await owner.dispose(); await ctx.fiber.dispose(); server.closeAllConnections(); server.close() }
