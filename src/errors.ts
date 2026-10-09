/** Preserve useful diagnostics, including DSH's plain-object cancellation reasons. */
export function errorText(error: unknown, depth = 0): string {
  if (depth > 3) return 'nested error'
  if (typeof error === 'string') return error.slice(0, 2000)
  if (!error || typeof error !== 'object') return String(error)
  const fields = error as Record<string, unknown>
  const detail = ['message', 'code', 'kind'].flatMap(key =>
    typeof fields[key] === 'string' ? [String(fields[key]).slice(0, 2000)] : [])
  if (fields.cause !== undefined && fields.cause !== error) detail.push(errorText(fields.cause, depth + 1))
  return detail.join(': ') || 'Unknown error (no message provided)'
}
