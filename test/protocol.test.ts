import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { commandSchema } from '../src/protocol.ts'

test('the wire does not admit raw CDP, code, arbitrary target paths or owner changes in commands', () => {
  for (const input of [
    { surface: 'browser', operation: { action: 'evaluate', code: 'process.env' } },
    { surface: 'browser', operation: { action: 'open', url: 'https://example.com', owner: randomUUID() } },
    { surface: 'native', operation: { action: 'act', target: randomUUID(), tool: 'launch_app', args: {} } },
  ]) assert.equal(commandSchema.safeParse(input).success, false)
})
