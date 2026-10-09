import { randomUUID } from 'node:crypto'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client'
import { z } from 'zod'
import type { Config } from './index.ts'
import { ReplHost } from './repl-host.ts'
import { NativeRuntime, NativeSurface } from './native.ts'
import { BrowserBroker } from './browser-broker.ts'
import { result, type Command, type Result } from './protocol.ts'
import { errorText } from './errors.ts'
import { replBootstrap } from './repl-documentation.ts'

export const inject = ['tools', 'agents', 'systemPrompt', 'fs', 'subprocess', 'sandbox', 'sandboxPolicy']
const inputSchema = z.object({ code: z.string().min(1).max(65536), title: z.string().max(200).optional(), timeout_ms: z.number().int().min(1000).max(120000).optional() }).strict()
export function apply(ctx: Context, config: { [K in keyof Config]: Volatile<Config[K]> }): void {
  const owners = new Map<Agent, { id: string; repl: ReplHost; native: NativeSurface; runtime: NativeRuntime; timer?: ReturnType<typeof setTimeout>; busy: boolean }>()
  let browser: BrowserBroker | undefined
  let browserError: string | undefined
  ctx.inject(['connection'], scope => {
    try {
      const broker = new BrowserBroker(scope); browser = broker; browserError = undefined
      scope.effect(() => () => { if (browser === broker) browser = undefined; broker.dispose() })
    } catch (error) { browserError = errorText(error); ctx.logger.warn(`Browser bridge: ${browserError}`); throw error }
  })
  async function release(agent: Agent) {
    const owner = owners.get(agent)
    if (!owner) return
    owners.delete(agent); clearTimeout(owner.timer); browser?.release(owner.id)
    await owner.repl.dispose()
    try { await owner.native.dispose() } finally { await owner.runtime.dispose() }
  }
  ctx.effect(() => () => Promise.all([...owners.keys()].map(release)).then(() => {}))
  const schema = (value: z.ZodType) => ({ type: 'object' as const, ...z.record(z.string(), z.json()).parse(z.toJSONSchema(value, { io: 'input' })) })
  ctx.tools.register(createMcpToolDefinition(ctx, {
    name: 'cua_repl', rawName: 'cua_repl',
    description: 'Run persistent JavaScript for session-owned native apps and DSH Desktop browser tabs. Uses the DSH Node runtime and file sandbox. Variables survive successful calls; cancellation/reset discards them. First call: execute one documented entry point and read the returned API reference; use await cua.rewriteDocumentation() to read it without accessing a target.',
    inputSchema: schema(inputSchema),
    async call(args, execution) {
      const input = inputSchema.parse(args)
      const agent = execution.agent
      if (!agent || ctx.agents.get(agent.id) !== agent) throw new Error('cua_repl requires an exact live Agent')
      let owner = owners.get(agent)
      if (owner?.busy) throw new Error('Another cua_repl evaluation is still running in this Agent')
      const policy = ctx.sandboxPolicy.resolve({ session: agent.session })
      if (owner && (owner.repl.closed || JSON.stringify(owner.repl.policy) !== JSON.stringify(policy))) {
        await release(agent); owner = undefined
        throw new Error('REPL variables and targets were reset because the runtime or sandbox policy changed. Start a new call and discover targets again.')
      }
      if (!owner) {
        const id = randomUUID()
        const runtime = new NativeRuntime()
        const native = new NativeSurface(runtime, () => config.maxTargets.get())
        let queue: Promise<unknown> = Promise.resolve()
        const dispatch = (command: Command, signal: AbortSignal): Promise<Result> => {
          const task = queue.catch(() => {}).then(async () => {
            signal.throwIfAborted()
            if (command.surface === 'native') {
              if (!config.native.get()) throw new Error('Native Computer Use is disabled')
              return native.execute(command.operation, signal)
            }
            else {
              if (!browser) throw new Error(`The DSH Desktop client connection is unavailable: ${browserError ?? `connection=${!!ctx.get('connection')}, webServer=${!!ctx.get('webServer')}`}`)
              return browser.call(id, String(agent.session.id), policy.workspaceRoot, command.operation, signal)
            }
          })
          queue = task
          return task
        }
        owner = { id, repl: new ReplHost(ctx, policy, dispatch), native, runtime, busy: false }
        owners.set(agent, owner)
        agent.ctx.effect(() => () => release(agent))
      }
      clearTimeout(owner.timer); owner.busy = true
      const signal = AbortSignal.any([execution.signal, AbortSignal.timeout(input.timeout_ms ?? config.timeoutMs.get())])
      try { return await owner.repl.evaluate(input.code, signal) }
      catch (error) { await release(agent); throw error }
      finally {
        owner.busy = false; owner.native.invalidateAll()
        if (owners.get(agent) === owner) owner.timer = setTimeout(() => { void release(agent).catch(error => ctx.logger.warn(String(error))) }, config.idleTimeoutMs.get()).unref()
      }
    },
  }))
  ctx.tools.register(createMcpToolDefinition(ctx, { name: 'cua_repl_reset', rawName: 'cua_repl_reset', description: 'Discard this Agent’s REPL variables, browser tabs and native target bindings.', inputSchema: schema(z.object({}).strict()),
    async call(args, execution) { z.object({}).strict().parse(args); if (execution.agent) await release(execution.agent); return result({ reset: true }) },
  }))
  ctx.systemPrompt.section({ name: 'unified-computer-use', order: ctx.systemPrompt.getSectionOrder('TOOL_COMPUTER_USE'), text: replBootstrap })
}
