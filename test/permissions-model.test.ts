import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PermissionSetup } from '../src/permissions-model.ts'
import type { PermissionsApi, PermissionsState } from '../src/permissions-contract.ts'
const granted: PermissionsState = { platform: 'darwin', nativeEnabled: true, accessibility: 'granted', screenRecording: 'granted' }
const turn = () => new Promise<void>(resolve => setImmediate(resolve))
function api(overrides: Partial<PermissionsApi> = {}): PermissionsApi {
  return { query: async () => granted, request: async () => granted, openSettings: async () => granted, ...overrides }
}

test('setup only queries on entry/focus; requests coalesce and remote error details survive', async () => {
  let queries = 0, requests = 0
  const request = Promise.withResolvers<PermissionsState>()
  const setup = new PermissionSetup(api({ query: async () => { queries++; return granted }, request: async () => { requests++; return request.promise } }))
  setup.start(); await setup.query()
  assert.equal(queries, 1); assert.equal(requests, 0)
  await setup.query(); assert.equal(queries, 2)
  const a = setup.request(), b = setup.request(); await turn()
  assert.equal(a, b); assert.equal(requests, 1)
  request.reject({ code: 'gateway/offline', message: 'Host disconnected' })
  await a
  assert.equal(setup.getSnapshot().status, undefined)
  assert.deepEqual(setup.getSnapshot().failure, { operation: 'request', code: 'gateway/offline', message: 'Host disconnected' })
  await setup.query(); assert.deepEqual(setup.getSnapshot().status, granted)
  assert.equal(setup.getSnapshot().failure, undefined)
  setup.stop()
})

test('stopping a view prevents queued prompting and ignores late responses from an old mount', async () => {
  const old = Promise.withResolvers<PermissionsState>()
  let queries = 0, prompts = 0
  const setup = new PermissionSetup(api({ query: () => ++queries === 1 ? old.promise : Promise.resolve(granted), request: async () => { prompts++; return granted } }))
  setup.start(); await turn(); setup.stop(); setup.start(); await setup.query()
  old.resolve({ ...granted, accessibility: 'notGranted' }); await turn()
  assert.deepEqual(setup.getSnapshot().status, granted)
  const request = setup.request(); setup.stop(); await request
  assert.equal(prompts, 0)
  await setup.request(); assert.equal(prompts, 0)
})

test('timeout clears stale grants and ignores a late success; recheck recovers', async () => {
  const late = Promise.withResolvers<PermissionsState>()
  let fail = false
  const setup = new PermissionSetup(api({ query: () => fail ? late.promise : Promise.resolve(granted) }), 20)
  setup.start(); await setup.query(); fail = true
  await setup.query()
  assert.equal(setup.getSnapshot().busy, false)
  assert.equal(setup.getSnapshot().status, undefined)
  assert.match(setup.getSnapshot().failure!.message, /timed out/)
  late.resolve(granted); await turn()
  assert.equal(setup.getSnapshot().status, undefined)
  fail = false; await setup.query()
  assert.deepEqual(setup.getSnapshot().status, granted)
  setup.stop()
})

test('opening Settings has its own failure state and never requests permission', async () => {
  let requested = false
  const setup = new PermissionSetup(api({ request: async () => { requested = true; return granted }, openSettings: async () => { throw new Error('open failed') } }))
  setup.start(); await setup.query(); await setup.openSettings('screenRecording')
  assert.equal(setup.getSnapshot().failure!.operation, 'openSettings')
  assert.equal(requested, false)
  setup.stop()
})
