import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NativeAxDisplay } from '../src/native-ax-display.ts'

function axState(generation = 1, target = '00000000-0000-4000-8000-000000000001') {
  return { target, pid: 123, window_id: 7, elements_complete: true, truncated: false, degraded: false,
    tree_markdown: 'Read-only window description. '.repeat(70),
    elements: Array.from({ length: 12 }, (_, i) => ({ element_index: i, element_token: `snapshot${generation}:${i}`,
      role: i === 0 ? 'AXButton' : 'AXStaticText', actions: i === 0 ? ['press'] : [], parent_index: 0,
      label: `${i === 0 ? 'Save' : `Row ${i}`} ${'long accessible description '.repeat(12)}` })) }
}

test('AX diff retains current tokens, actionable rows and metadata without mutating the returned state', () => {
  const display = new NativeAxDisplay()
  assert.match(display.render(axState()), /^AX state/)
  const next = { ...axState(2), window_title: 'Updated title' }
  const before = JSON.stringify(next)
  const delta = display.render(next)
  assert.match(delta, /^AX display diff/)
  assert.match(delta, /Updated title/)
  assert.match(delta, /Save long accessible description/)
  assert.match(delta, /unchanged_display_from/)
  for (const e of next.elements) assert.ok(delta.includes(e.element_token))
  assert.doesNotMatch(delta, /snapshot1:/)
  assert.equal(JSON.stringify(next), before)
  assert.ok(delta.length < before.length)
})

test('AX diff reports changed, inserted, removed and reordered rows as current display content', () => {
  const display = new NativeAxDisplay()
  display.render(axState())
  const changed = axState(2)
  changed.elements[2].label = 'Changed value'
  changed.elements.splice(4, 1)
  changed.elements.push({ ...changed.elements[3], element_index: 99, element_token: 'new:99', label: 'Inserted value' })
  ;[changed.elements[5], changed.elements[6]] = [changed.elements[6], changed.elements[5]]
  const delta = display.render(changed)
  assert.match(delta, /Changed value/)
  assert.match(delta, /Inserted value/)
  assert.match(delta, /Row 7 long accessible/)
  assert.match(delta, /Row 5 long accessible/)
  assert.doesNotMatch(delta, /snapshot2:4/)
  changed.elements.pop()
  assert.match(display.render(changed), /11 current rows, previously 12/)
})

test('AX display full override and per-target baselines do not substitute window identity', () => {
  const display = new NativeAxDisplay()
  display.render(axState())
  assert.match(display.render(axState(2), true), /^AX state/)
  assert.match(display.render(axState(3)), /^AX display diff/)
  assert.match(display.render(axState(1, 'other')), /^AX state/)
  assert.match(display.render(axState(4)), /^AX display diff/)
  assert.match(display.render({ ...axState(4), window_id: 8 }), /^AX state/)
  display.clear()
  assert.match(display.render(axState(5)), /^AX state/)
})

test('incomplete, degraded, unknown or oversized observations clear rather than seed diff baselines', () => {
  for (const override of [{ truncated: true }, { degraded: true }, { elements_complete: false }, { elements_complete: undefined }, { warnings: ['partial'] }, { tree_markdown: 'x'.repeat(70_000) }]) {
    const display = new NativeAxDisplay()
    display.render(axState())
    assert.match(display.render({ ...axState(2), ...override }), /^AX state/)
    assert.match(display.render(axState(3)), /^AX state/)
  }
  assert.match(new NativeAxDisplay().render({ ...axState(), tree_markdown: 'x'.repeat(70_000) }), /AX display truncated/)
})

test('unknown action capabilities and small states remain full, and retained targets are bounded', () => {
  const display = new NativeAxDisplay()
  const state = { ...axState(), tree_markdown: '', elements: axState().elements.map(({ actions, ...e }) => e) }
  display.render(state)
  assert.match(display.render(state), /^AX state/)
  const tiny = { ...axState(), tree_markdown: '', elements: [] }
  display.render(tiny)
  assert.match(display.render(tiny), /^AX state/)
  for (let i = 0; i < 33; i++) display.render(axState(1, `target${i}`))
  assert.match(display.render(axState(2, 'target0')), /^AX state/)
})
