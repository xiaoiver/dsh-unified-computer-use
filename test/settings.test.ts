import { test } from 'node:test'
import assert from 'node:assert/strict'
import { draftFrom, settingsEdits } from '../src/settings-model.ts'

test('settings form preserves millisecond precision while displaying seconds', () => {
  const value = { native: false, timeoutMs: 1001, idleTimeoutMs: 10001, maxTargets: 3 }
  const draft = draftFrom(value)
  assert.equal(draft.timeoutSeconds, '1.001')
  assert.deepEqual(Object.fromEntries(settingsEdits(draft).map(op => [op.path[0], op.value])), value)
})
test('settings form refuses empty, fractional target limits and out-of-range input before saving', () => {
  for (const change of [{ timeoutSeconds: '' }, { timeoutSeconds: '0' }, { timeoutSeconds: '121' }, { idleSeconds: '9' }, { maxTargets: '1.5' }, { maxTargets: '33' }]) {
    assert.throws(() => settingsEdits({ ...draftFrom(), ...change }), /范围|格式/)
  }
})
