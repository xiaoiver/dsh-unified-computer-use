import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { LlmAdapter, ToolCallId, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import Approval from '@deepseek-ai/dsh-user-approval'
import * as Plugin from '../src/index.ts'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fakeCompanion } from './fake-companion.ts'
import { resultSchema } from '../src/protocol.ts'

class FixtureModel extends LlmAdapter { async *stream(): AsyncIterable<StreamChunk> { throw new Error('No API call is expected') } }
async function setup(approval: 'ask' | 'inherit', electronExecutable = '/missing-dsh-cua-electron', runtimeDirectory = '') {
  const ctx = new Context()
  for (const plugin of [LlmRuntime, SessionStore, SessionProjections, SystemPrompt, ToolRuntime, AgentRegistry]) await ctx.plugin(plugin)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(Approval)
  ctx.llm.registerAdapter(['fixture'], new FixtureModel())
  const owner = await ctx.agents.create({ sessionId: SessionId('computer-use-test'), agentOptions: { provider: 'fixture', model: 'fixture' } })
  owner.agent.session.append('turn/start', { turn: 1 })
  await ctx.plugin(Plugin, { approval, timeoutMs: 1000, idleTimeoutMs: 10000, maxTargets: 4, native: true, pip: true, electronExecutable, runtimeDirectory, startupTimeoutMs: 5000 })
  return { ctx, owner }
}

test('DSH registers the unified schema and standard prompt, and reports a missing configured companion executable', async () => {
  const { ctx, owner } = await setup('inherit')
  try {
    assert.ok(ctx.tools.schemas().some(s => s.name === 'cua'))
    const output = await ctx.tools.execute({ name: 'cua', arguments: { surface: 'browser', operation: { action: 'list' } }, agent: owner.agent, callId: ToolCallId('missing-host'), signal: new AbortController().signal })
    assert.equal(output.isError, true)
    assert.match(JSON.stringify(output.content), /ENOENT/)
  } finally { await owner.dispose(); await ctx.fiber.dispose() }
})

test('DSH approval denial prevents companion startup', async () => {
  const { ctx, owner } = await setup('ask')
  try {
    let asked = false
    ctx.on('approval/request', async () => { asked = true; return 'rejected' })
    const output = await ctx.tools.execute({ name: 'cua', arguments: { surface: 'browser', operation: { action: 'list' } }, agent: owner.agent, callId: ToolCallId('denied'), signal: new AbortController().signal })
    assert.equal(asked, true, JSON.stringify(output))
    assert.equal(output.isError, true)
    assert.doesNotMatch(JSON.stringify(output), /ENOENT/)
  } finally { await owner.dispose(); await ctx.fiber.dispose() }
})

test('DSH real ToolRuntime uses its own child and releases Agent resources without a parent channel', async () => {
  const fixture = await fakeCompanion()
  const { ctx, owner } = await setup('inherit', fixture.executable, fixture.directory)
  try {
    const output = await ctx.tools.execute({ name: 'cua', arguments: { surface: 'browser', operation: { action: 'list' } }, agent: owner.agent, callId: ToolCallId('companion'), signal: new AbortController().signal })
    assert.equal(output.isError, false, JSON.stringify(output))
    const result = resultSchema.parse(output.value)
    assert.equal(result.structuredContent?.fixture, true)
    assert.equal(result.structuredContent?.kind, 'command')
    assert.equal(typeof result.structuredContent?.owner, 'string')
    await owner.dispose()
  } finally { await ctx.fiber.dispose(); await fixture.dispose() }
})

test('Agent disposal cancels an unfinished companion startup instead of waiting for its deadline', async () => {
  const fixture = await fakeCompanion(false)
  const { ctx, owner } = await setup('inherit', fixture.executable, fixture.directory)
  try {
    const pending = ctx.tools.execute({ name: 'cua', arguments: { surface: 'browser', operation: { action: 'list' } }, agent: owner.agent, callId: ToolCallId('cancel-startup'), signal: new AbortController().signal })
    for (let i = 0; i < 100; i++) {
      if ((await readdir(join(fixture.directory, 'sessions')).catch(() => [])).length) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    const start = Date.now()
    await owner.dispose()
    assert.ok(Date.now() - start < 3000, 'Disposal should abort startup, not wait for its 5-second deadline')
    assert.equal((await pending).isError, true)
    assert.deepEqual(await readdir(join(fixture.directory, 'sessions')), [])
  } finally { await ctx.fiber.dispose(); await fixture.dispose() }
})

test('a canceled startup does not poison a later call from the same or another live Agent', async () => {
  const fixture = await fakeCompanion(false)
  const { ctx, owner } = await setup('inherit', fixture.executable, fixture.directory)
  const other = await ctx.agents.create({ sessionId: SessionId('computer-use-recovery'), agentOptions: { provider: 'fixture', model: 'fixture' } })
  other.agent.session.append('turn/start', { turn: 1 })
  const abort = new AbortController()
  const call = (agent: typeof owner.agent, signal: AbortSignal) => ctx.tools.execute({ name: 'cua', arguments: { surface: 'browser', operation: { action: 'list' } }, agent, callId: ToolCallId('recovery'), signal })
  try {
    const pending = call(owner.agent, abort.signal)
    for (let i = 0; i < 100; i++) {
      if ((await readdir(join(fixture.directory, 'sessions')).catch(() => [])).length) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    abort.abort({ kind: 'user' })
    const canceled = await pending
    assert.equal(canceled.isError, true)
    assert.match(JSON.stringify(canceled.content), /canceled/)
    assert.doesNotMatch(JSON.stringify(canceled.content), /\[object Object\]/)
    assert.deepEqual(await readdir(join(fixture.directory, 'sessions')), [])
    await writeFile(fixture.executable, (await readFile(fixture.executable, 'utf8')).replace('if (false)', 'if (true)'))
    for (const agent of [other.agent, owner.agent]) {
      const output = await call(agent, new AbortController().signal)
      assert.equal(output.isError, false, JSON.stringify(output))
    }
  } finally { await other.dispose(); await owner.dispose(); await ctx.fiber.dispose(); await fixture.dispose() }
})
