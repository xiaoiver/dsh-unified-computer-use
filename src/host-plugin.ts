import type { Context, Volatile } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client'
import { z } from 'zod'
import type { Config } from './index.ts'
import { ReplHost } from './repl-host.ts'
import { NativeRuntime, NativeSurface } from './native.ts'
import { NativePip } from './native-pip.ts'
import { NativeHelperInstaller } from './native-helper.ts'
import { PlaywrightBrowser } from './browser-playwright.ts'
import { result, type Command, type Result } from './protocol.ts'
import { replBootstrap } from './repl-documentation.ts'
import { registerPermissions } from './permissions-host.ts'

export const inject = ['tools', 'agents', 'systemPrompt', 'fs', 'subprocess', 'sandbox', 'sandboxPolicy']
const inputSchema = z.object({ code: z.string().min(1).max(65536), title: z.string().max(200).optional(), timeout_ms: z.number().int().min(1000).max(120000).optional() }).strict()
export function apply(ctx: Context, config: { [K in keyof Config]: Volatile<Config[K]> }): void {
  registerPermissions(ctx, () => config.native.get())
  const helper = new NativeHelperInstaller()
  const owners = new Map<Agent, { repl: ReplHost; native: NativeSurface; browser: PlaywrightBrowser; runtime: NativeRuntime; preview: NativePip; timer?: ReturnType<typeof setTimeout>; busy: boolean }>()
  async function release(agent: Agent) {
    const owner = owners.get(agent)
    if (!owner) return
    owners.delete(agent); clearTimeout(owner.timer)
    try { await Promise.all([owner.repl.dispose(), owner.browser.dispose()]) } finally {
      try { await owner.native.dispose() } finally { await Promise.all([owner.runtime.dispose(), owner.preview.dispose()]) }
    }
  }
  ctx.effect(() => async () => {
    await Promise.allSettled([...owners.keys()].map(release))
    await helper.dispose()
  })
  ctx.on('agent/status', ({ agent, status }) => {
    const preview = owners.get(agent)?.preview
    if (status === 'idle') preview?.finish()
    else preview?.resume()
  })
  const schema = (value: z.ZodType) => ({ type: 'object' as const, ...z.record(z.string(), z.json()).parse(z.toJSONSchema(value, { io: 'input' })) })
  ctx.tools.register(createMcpToolDefinition(ctx, {
    name: 'cua_repl', rawName: 'cua_repl',
    description: 'Run persistent JavaScript for session-owned native apps and isolated installed-Chrome tabs backed by real Playwright. Uses the DSH Node runtime and file sandbox. Variables survive successful calls; cancellation/reset discards them. First call: execute one documented entry point and read the returned API reference; use await cua.rewriteDocumentation() to read it without accessing a target.',
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
        const runtime = new NativeRuntime(helper)
        const browser = new PlaywrightBrowser()
        const preview = new NativePip(message => ctx.logger.warn(message))
        const native = new NativeSurface(runtime, () => config.maxTargets.get(), preview)
        let queue: Promise<unknown> = Promise.resolve()
        const dispatch = (command: Command, signal: AbortSignal): Promise<Result> => {
          const task = queue.catch(() => {}).then(async () => {
            signal.throwIfAborted()
            if (command.surface === 'native') {
              if (!config.native.get()) throw new Error('Native Computer Use is disabled')
              return native.execute(command.operation, signal)
            }
            else {
              return browser.execute(command.operation, signal)
            }
          })
          queue = task
          return task
        }
        owner = { repl: new ReplHost(ctx, policy, dispatch), native, browser, runtime, preview, busy: false }
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
