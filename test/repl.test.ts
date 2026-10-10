import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ReplHost } from '../src/repl-host.ts'
import { result } from '../src/protocol.ts'

import { fixture } from './helpers/repl-fixture.ts'
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

test('documentation is layered, rereadable without target access, and independent per interpreter', async () => {
  const { readFile } = await import('node:fs/promises')
  const common = await readFile(new URL('../docs/CUA-API.md', import.meta.url), 'utf8')
  const browser = await readFile(new URL('../docs/BROWSER-API.md', import.meta.url), 'utf8')
  const target = '00000000-0000-4000-8000-000000000001'
  let calls = 0
  const a = fixture(async command => {
    calls++
    if (command.surface === 'browser' && command.operation.action === 'observe' && command.operation.target !== target) throw Error('Browser target is closed or belongs to another session')
    return result({ target, title: 'Fixture title', url: 'https://example.com', text: 'Fixture text', elements: [] })
  })
  const b = fixture()
  const blocks = (r: Awaited<ReturnType<typeof evaluate>>) => r.content.filter(c => c.type === 'text').map(c => c.text)
  try {
    assert.deepEqual(blocks(await evaluate(a.host, 'await cua.rewriteDocumentation()')), [common])
    assert.deepEqual(blocks(await evaluate(a.host, 'await cua.rewriteDocumentation()')), [common])
    assert.equal(calls, 0)
    const opened = blocks(await evaluate(a.host, "let tab = await cua.createBrowserTab('https://example.com')"))
    assert.equal(opened[0], browser); assert.equal(opened.length, 2)
    assert.match(opened[1], /Fixture title/)
    assert.deepEqual(blocks(await evaluate(a.host, 'await cua.rewriteDocumentation()')), [common, browser])
    assert.equal(calls, 1)
    // Documentation is the exact shipped source, not a separately maintained summary.
    assert.deepEqual(blocks(await evaluate(a.host, 'nodeRepl.write(await cua.documentation())')), [common])
    assert.deepEqual(blocks(await evaluate(a.host, 'nodeRepl.write(await tab.documentation())')), [browser])
    const rebound = await evaluate(a.host, 'let same = await cua.getTab(tab.id)')
    assert.equal(blocks(rebound).length, 1); assert.match(text(rebound), /Fixture title/)
    assert.equal((await evaluate(a.host, "await cua.getTab('00000000-0000-4000-8000-000000000099')")).isError, true)
    assert.deepEqual(blocks(await evaluate(b.host, 'await cua.rewriteDocumentation()')), [common])
    assert.doesNotMatch(text(await evaluate(a.host, 'let count = 1; ++count')), /# Computer Use API/)
    // Every public method on each binding must have a signature in the relevant reference.
    await evaluate(a.host, 'let app = await cua.getApp({pid:1,windowId:2})')
    for (const [name, doc] of [['cua', common + browser], ['app', common], ['tab', browser], ['nodeRepl', common]]) {
      const methods = blocks(await evaluate(a.host, `nodeRepl.write(JSON.stringify(Object.keys(${name}).filter(key => typeof ${name}[key] === 'function')))`))[0]
      const actual: string[] = JSON.parse(methods)
      for (const method of actual) assert.ok(doc.includes(`${name}.${method}(`), `${name}.${method} is not documented`)
      for (const [, method] of doc.matchAll(new RegExp(`^${name}\\.(\\w+)\\(`, 'gm'))) assert.ok(actual.includes(method), `${name}.${method} is documented but missing`)

    }
    // Detached documentation callbacks cannot contaminate a later cell's output.
    await evaluate(a.host, 'setTimeout(() => cua.rewriteDocumentation().catch(() => {}), 50); undefined')
    assert.doesNotMatch(text(await evaluate(a.host, 'await new Promise(r => setTimeout(r, 100))')), /# Computer Use API/)
  } finally { await a.host.dispose(); await b.host.dispose() }
})

test('browser documentation is retried after failed binding and introduced on successful raw use', async () => {
  let failures = 2
  const a = fixture(async () => {
    if (failures-- > 0) return { isError: true, content: [{ type: 'text', text: 'Browser unavailable' }] }
    return result({ tabs: [] })
  })
  try {
    const failed = await evaluate(a.host, "await cua.createBrowserTab('https://example.com')")
    assert.equal(failed.isError, true); assert.doesNotMatch(text(failed), /# Browser API/)
    assert.doesNotMatch(text(await evaluate(a.host, "await cua.browser({action:'list'})")), /# Browser API/)
    assert.match(text(await evaluate(a.host, "await cua.browser({action:'list'})")), /# Browser API/)
    assert.doesNotMatch(text(await evaluate(a.host, "await cua.browser({action:'list'})")), /# Browser API/)
  } finally { await a.host.dispose() }
})

test('observations display text/images once, return structured state and honor emit:false', async () => {
  const target = '00000000-0000-4000-8000-000000000001'
  const a = fixture(async command => {
    const r = result({ target, marker: 'observed-state', elements: [] })
    if ((command.operation.action === 'observe' && command.operation.screenshot) || (command.operation.action === 'playwright' && command.operation.method === 'screenshot')) r.content.push({ type: 'image', data: 'ZmFrZS1pbWFnZQ==', mimeType: 'image/png' })
    return r
  })
  try {
    await evaluate(a.host, 'await cua.rewriteDocumentation()')
    assert.equal((await evaluate(a.host, 'await cua.getState()')).content.length, 1)
    assert.equal((await evaluate(a.host, 'await cua.listWindows(1)')).content.length, 1)
    await evaluate(a.host, "let tab = await cua.createBrowserTab('https://example.com'); let app = await cua.getApp({pid:1,windowId:2})")
    for (const name of ['tab', 'app']) {
      const r = await evaluate(a.host, `await ${name}.getState({screenshot:true})`)
      assert.equal(r.content.length, 2)
      assert.equal(r.content[0].type, 'text'); assert.equal(r.content[1].type, 'image')
      assert.match(text(r), /observed-state/)
      const silent = await evaluate(a.host, `await ${name}.getState({screenshot:true,emit:false})`)
      assert.doesNotMatch(text(silent), /observed-state|ZmFrZS/)
      assert.equal((await evaluate(a.host, `const ${name}State = await ${name}.getState({emit:false}); nodeRepl.write(${name}State.marker)`)).content.length, 1)
      assert.match(text(await evaluate(a.host, `${name}State.marker`)), /observed-state/)
    }
    const raw = await evaluate(a.host, "const raw = await cua.browser({action:'observe',target:tab.id,screenshot:true}); nodeRepl.emitImage(raw.content.find(c=>c.type==='image'))")
    assert.equal(raw.content.length, 1); assert.equal(raw.content[0].type, 'image')
  } finally { await a.host.dispose() }
})

test('invalid image output after a native screenshot preserves the REPL and app binding', async () => {
  const target = '00000000-0000-4000-8000-000000000001'
  const a = fixture(async command => {
    const r = result({ target, pid: 1, window_id: 2, elements: [] })
    if (command.operation.action === 'observe' && command.operation.screenshot) r.content.push({ type: 'image', data: 'ZmFrZQ==', mimeType: 'image/png' })
    return r
  })
  try {
    await evaluate(a.host, 'const calc2 = await cua.getApp({pid:1,windowId:2}); let saved = 7')
    const failure = await evaluate(a.host, "const shot = await calc2.getState({screenshot:true}); nodeRepl.emitImage({data:shot.screenshot_base64 ?? shot.screenshot,mimeType:shot.screenshot_mime_type || 'image/png'});")
    assert.equal(failure.isError, true)
    assert.match(text(failure), /emitImage.*data.*mimeType/)
    assert.equal(failure.content.filter(c => c.type === 'image').length, 1)
    assert.equal(a.host.closed, false)
    assert.match(text(await evaluate(a.host, 'saved')), /7/)
    const next = await evaluate(a.host, 'await calc2.getState({screenshot:true})')
    assert.equal(next.isError, undefined)
    assert.equal(next.content.filter(c => c.type === 'image').length, 1)
    assert.doesNotMatch(text(next), /# Computer Use API/)
    assert.equal(a.children.length, 1)
  } finally { await a.host.dispose() }
})

test('emitImage rejects invalid arguments locally and accepts objects and cross-realm bytes', async () => {
  const a = fixture()
  try {
    await evaluate(a.host, 'let saved = 42')
    for (const input of ['undefined', 'null', '1', "'image'", '{}', "{data:1,mimeType:'image/png'}", "{data:'',mimeType:'image/png'}", "{data:'ZmFrZQ=='}", "{data:'ZmFrZQ==',mimeType:42}", "{data:'ZmFrZQ==',mimeType:''}", "{data:'ZmFrZQ==',mimeType:'text/plain'}", 'new Uint8Array()', 'new Uint16Array([1])']) {
      const failure = await evaluate(a.host, `nodeRepl.emitImage(${input})`)
      assert.equal(failure.isError, true, input)
      assert.match(text(failure), /emitImage/, input)
      assert.equal(a.host.closed, false, input)
    }
    assert.match(text(await evaluate(a.host, 'saved')), /42/)
    for (const input of ["{data:'ZmFrZQ==',mimeType:'image/png'}", 'new Uint8Array([102,97,107,101])', "Buffer.from('fake')"]) {
      const success = await evaluate(a.host, `nodeRepl.emitImage(${input})`)
      assert.equal(success.isError, undefined)
      assert.deepEqual(success.content, [{ type: 'image', data: 'ZmFrZQ==', mimeType: 'image/png' }])
    }
    assert.equal(a.children.length, 1)
  } finally { await a.host.dispose() }
})

test('shipped JavaScript documentation examples execute against the real REPL transport', async () => {
  const { readFile } = await import('node:fs/promises')
  const a = fixture(async command => {
    const r = result({ target: '00000000-0000-4000-8000-000000000001', title: 'Example Domain', url: 'https://example.com', text: '', elements: [] })
    if ((command.operation.action === 'observe' && command.operation.screenshot) || (command.operation.action === 'playwright' && command.operation.method === 'screenshot')) r.content.push({ type: 'image', data: 'ZmFrZQ==', mimeType: 'image/png' })
    return r
  })
  try {
    for (const name of ['CUA-API', 'BROWSER-API']) {
      const doc = await readFile(new URL(`../docs/${name}.md`, import.meta.url), 'utf8')
      const examples = [...doc.matchAll(/```javascript\n([\s\S]*?)```/g)]
      assert.ok(examples.length > 0)
      for (const [, code] of examples) {
        const r = await evaluate(a.host, code)
        assert.notEqual(r.isError, true, text(r))
      }
    }
  } finally { await a.host.dispose() }
})
