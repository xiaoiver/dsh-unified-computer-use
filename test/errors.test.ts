import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errorText } from '../src/errors.ts'

test('diagnostics preserve cross-realm messages and network error causes without dumping unrelated fields', () => {
  assert.equal(errorText({ message: 'fetch failed', cause: { code: 'ECONNRESET', secret: 'private' } }), 'fetch failed: ECONNRESET')
})
