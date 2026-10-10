import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway'
import { NativePermissions, requireNativePermissions } from '../src/permissions-native.ts'
import { registerPermissions } from '../src/permissions-host.ts'
import { permissionsApi, mountPermissionsClient } from '../src/permissions-client.ts'
import type { PermissionsState, PermissionsApi } from '../src/permissions-contract.ts'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import * as cordis from '@deepseek-ai/cordis'
import { permissionsRemote } from '../src/permissions-contract.ts'

function fixture() {
  let enabled = true
  let status = { accessibility: false, screenRecording: false }
  let requests = 0, loads = 0
  const panes: string[] = []
  const sdk = {
    currentMacOsPermissionStatus: () => ({ ...status }),
    // A misleading immediate result must not be treated as a grant.
    requestMacOsPermissions: () => { requests++; return { accessibility: true, screenRecording: true } },
  }
  const permissions = new NativePermissions(() => enabled, 'darwin', async () => { loads++; return sdk }, async p => { panes.push(p) })
  return { permissions, panes, counts: () => ({ requests, loads }),
    setEnabled: (value: boolean) => { enabled = value },
    setStatus: (value: typeof status) => { status = value } }
}

test('opening permission setup is read-only; requests re-query and concurrent requests coalesce', async () => {
  const f = fixture()
  assert.equal((await f.permissions.query()).accessibility, 'notGranted')
  assert.equal(f.counts().requests, 0)
  const [a, b] = await Promise.all([f.permissions.request(), f.permissions.request()])
  assert.deepEqual(a, b)
  assert.equal(f.counts().requests, 1)
  assert.equal(a.accessibility, 'notGranted')
  f.setStatus({ accessibility: true, screenRecording: false })
  assert.equal((await f.permissions.query()).accessibility, 'granted')
  assert.equal((await f.permissions.openSettings('screenRecording')).screenRecording, 'notGranted')
  assert.deepEqual(f.panes, ['screenRecording'])
  assert.equal(f.counts().requests, 1)
})

test('disabled or unsupported Hosts cannot request; only fixed privacy panes are accepted', async () => {
  const f = fixture()
  f.setEnabled(false)
  await assert.rejects(f.permissions.request(), /enabled/)
  await assert.rejects(f.permissions.openSettings('accessibility'), /enabled/)
  assert.equal(f.counts().loads, 0)
  f.setEnabled(true)
  await assert.rejects(f.permissions.openSettings('anything' as 'accessibility'))
  assert.deepEqual(f.panes, [])
  const unsupported = new NativePermissions(() => true, 'linux', async () => { throw Error('must not load') })
  assert.equal((await unsupported.query()).accessibility, 'unsupported')
  await assert.rejects(unsupported.request(), /unavailable/)
})

test('permission load failures allow retry and a toggle changed during load prevents prompting', async () => {
  let enabled = true, attempts = 0, requests = 0
  const p = new NativePermissions(() => enabled, 'darwin', async () => {
    attempts++
    if (attempts === 1) throw Error('load failed')
    return { currentMacOsPermissionStatus: () => ({ accessibility: false, screenRecording: false }),
      requestMacOsPermissions: () => { requests++; return { accessibility: false, screenRecording: false } } }
  })
  await assert.rejects(p.request(), /load failed/)
  await p.request()
  assert.equal(requests, 1)
  const pending = p.request()
  enabled = false
  await assert.rejects(pending, /enabled/)
  assert.equal(requests, 1)
})

test('native permission failures explain setup, and only screenshots require Screen Recording', () => {
  const missing = { accessibility: false, screenRecording: false }
  requireNativePermissions('list_apps', {}, missing)
  assert.throws(() => requireNativePermissions('click', {}, missing), /Accessibility.*settings/)
  const ax = { accessibility: true, screenRecording: false }
  requireNativePermissions('get_window_state', { include_screenshot: false }, ax)
  requireNativePermissions('click', {}, ax)
  assert.throws(() => requireNativePermissions('get_window_state', { include_screenshot: true }, ax), /Screen Recording.*settings/)
})

test('real DSH Gateway exposes setup before any Agent exists and rejects unknown pane arguments', async () => {
  const host = new Context()
  const f = fixture()
  const fibers: Fiber[] = []
  try {
    const registry = host.plugin(TypertRegistry); fibers.push(registry); await registry.await()
    const gateway = host.plugin(TypertGatewayService, {}); fibers.push(gateway); await gateway.await()
    const setup = host.plugin(ctx => registerPermissions(ctx, () => true, () => f.permissions))
    fibers.push(setup); await setup.await()
    await new Promise(resolve => setImmediate(resolve))
    const call = (method: string, args = {}) => host.typertGateway.invoke({ namespace: 'unifiedCuaPermissions', method, args })
    assert.equal((await call('query') as PermissionsState).accessibility, 'notGranted')
    assert.equal(f.counts().requests, 0)
    await call('request')
    assert.equal(f.counts().requests, 1)
    await call('openSettings', { permission: 'accessibility' })
    assert.deepEqual(f.panes, ['accessibility'])
    await assert.rejects(call('openSettings', { permission: 'other' }))
    await assert.rejects(call('request', { prompt: true }))
    assert.equal(f.counts().requests, 1)
    await setup.dispose()
    await assert.rejects(call('request'))
    assert.equal(f.counts().requests, 1)
  } finally { for (const fiber of fibers.reverse()) await fiber.dispose() }
})

test('unloading setup while SDK loads prevents a late system prompt', async () => {
  let finish!: (sdk: { currentMacOsPermissionStatus(): { accessibility: boolean; screenRecording: boolean }; requestMacOsPermissions(): { accessibility: boolean; screenRecording: boolean } }) => void
  let prompts = 0
  const permissions = new NativePermissions(() => true, 'darwin', () => new Promise(resolve => { finish = resolve }))
  const request = permissions.request()
  permissions.dispose()
  finish({ currentMacOsPermissionStatus: () => ({ accessibility: false, screenRecording: false }),
    requestMacOsPermissions: () => { prompts++; return { accessibility: false, screenRecording: false } } })
  await assert.rejects(request, /closed/)
  assert.equal(prompts, 0)
})

test('published DSH Client mounts the custom namespace and calls the real Host Gateway', async () => {
  const host = new Context(), client = new Context(), f = fixture()
  const fibers: Fiber[] = []
  try {
    const registry = host.plugin(TypertRegistry); fibers.push(registry); await registry.await()
    const gateway = host.plugin(TypertGatewayService, {}); fibers.push(gateway); await gateway.await()
    const setup = host.plugin(ctx => registerPermissions(ctx, () => true, () => f.permissions)); fibers.push(setup); await setup.await()
    const clientRegistry = client.plugin(TypertRegistry); fibers.push(clientRegistry); await clientRegistry.await()
    client.provide('connection', {
      rpc: {
        async call(channel: string, endpoint: string, payload: { args: Record<string, unknown> }) {
          assert.equal(channel, '/api')
          const [namespace, method] = endpoint.split('/')
          try { return { ok: true, value: await host.typertGateway.invoke({ namespace, method, args: payload.args }) } }
          catch (error) { return { ok: false, error: { code: 'gateway/internal', message: String(error), details: {} } } }
        },
        async *open() {},
      },
      generation: { getSnapshot: () => undefined }, isLoopback: true,
      registerGenerationSource: () => () => {}, start: () => ({ stop() {} }),
    })
    // Published Client modules use DSH's module loader, not Node ESM exports.
    let clientGateway!: { apply(ctx: Context): void; inject: string[] }
    const source = await readFile(new URL('../node_modules/@deepseek-ai/dsh-api-gateway/lib/client.js', import.meta.url), 'utf8')
    runInNewContext(source, { window: { __ModuleLoader__: { load: ({ factory }: { factory(require: (name: string) => unknown): typeof clientGateway }) => {
      clientGateway = factory(name => { assert.equal(name, '@deepseek-ai/cordis'); return cordis })
    } } }, crypto: globalThis.crypto, AbortController, AbortSignal, setTimeout, clearTimeout, URL })
    const remote = client.plugin(clientGateway); fibers.push(remote); await remote.await()
    const ready = Promise.withResolvers<PermissionsApi>()
    const scopedClient = client.plugin({ inject: ['remote'], async apply(scope: Context) {
      await mountPermissionsClient(scope, (_scoped, api) => { ready.resolve(api) })
    } })
    fibers.push(scopedClient)
    await scopedClient.await()
    const api = await ready.promise
    try {
      assert.equal((await api.query()).accessibility, 'notGranted')
      assert.equal(f.counts().requests, 0)
      assert.equal((await api.request()).screenRecording, 'notGranted')
      assert.equal(f.counts().requests, 1)
      await api.openSettings('screenRecording')
      assert.deepEqual(f.panes, ['screenRecording'])
      await assert.rejects(api.openSettings('invalid' as 'screenRecording'))
      f.setEnabled(false)
      await assert.rejects(api.request(), /enabled/)
      assert.equal(f.counts().requests, 1)
    } finally { await scopedClient.dispose() }
    await assert.rejects(api.query())
  } finally { for (const fiber of fibers.reverse()) await fiber.dispose() }
})

test('client handles DSH error envelopes and validates permission state instead of assuming grants', async () => {
  const state: PermissionsState = { platform: 'darwin', nativeEnabled: true, accessibility: 'notGranted', screenRecording: 'notGranted' }
  const api = permissionsApi({ unifiedCuaPermissions: {
    query: async () => ({ ok: true, value: state }),
    request: async () => ({ ok: false, error: { message: 'Host offline' } }),
    openSettings: async () => ({ ok: true, value: { ...state, accessibility: true } }),
  } } as unknown as TypertClientRemote)
  assert.deepEqual(await api.query(), state)
  await assert.rejects(api.request(), (error: unknown) => (error as Error).message === 'Host offline')
  await assert.rejects(api.openSettings('accessibility'))
})
