/** Display-only comparisons. Never supplies element identity or authorizes input. */
const LIMIT = 65_536
interface Baseline { identity: string; rows: string[]; tree: unknown; sequence: number }
export class NativeAxDisplay {
  private baselines = new Map<string, Baseline>()
  private sequence = 0
  clear(target?: string): void { if (target === undefined) this.baselines.clear(); else this.baselines.delete(target) }
  render(state: Record<string, unknown>, disableDiffing = false): string {
    const sequence = ++this.sequence
    const serialized = JSON.stringify(state)
    const full = `AX state (display ${sequence}):\n${serialized}`
    const target = typeof state.target === 'string' ? state.target : undefined
    const previous = target ? this.baselines.get(target) : undefined
    this.clear(target)
    const elements = state.elements
    // Unknown completeness is not evidence of a complete observation.
    if (!target || state.elements_complete !== true || state.truncated || state.degraded ||
      state.truncation_reason || state.degraded_reason ||
      (Array.isArray(state.warnings) && state.warnings.length > 0) ||
      !Array.isArray(elements) || elements.length > 500 || full.length > LIMIT ||
      elements.some(e => !e || typeof e !== 'object' || typeof e.role !== 'string')) {
      return full.length <= LIMIT ? full : `${full.slice(0, LIMIT)}\n[AX display truncated; missing content does not imply absence. getState() still returns the complete driver result.]`
    }
    const rows = elements.map(element => {
      // Tokens change on every observation; all other fields, including hierarchy, must match.
      const { element_token: _token, ...attributes } = element
      return JSON.stringify(attributes)
    })
    const identity = JSON.stringify([state.pid, state.window_id])
    const baseline = { identity, rows, tree: state.tree_markdown, sequence }
    // Bound retained display data independently of the Host's configured target limit.
    if (this.baselines.size >= 32) this.baselines.delete(this.baselines.keys().next().value!)
    this.baselines.set(target, baseline)
    if (disableDiffing || !previous || previous.identity !== identity) return full
    const compact = elements.map((element, index) => {
      if (!Array.isArray(element.actions) || element.actions.length !== 0 || previous.rows[index] !== rows[index]) return element
      const unchanged = { element_index: element.element_index, element_token: element.element_token,
        unchanged_display_from: { observation: previous.sequence, row: index } }
      return JSON.stringify(unchanged).length < JSON.stringify(element).length ? unchanged : element
    })
    const tree = typeof state.tree_markdown === 'string' && state.tree_markdown === previous.tree
      ? `[tree_markdown unchanged from display ${previous.sequence}; use current element tokens, not previous indices.]`
      : state.tree_markdown
    const delta = `AX display diff ${sequence} from ${previous.sequence}: ${elements.length} current rows, previously ${previous.rows.length}. Unchanged rows compare display attributes only, not persistent identity. Only fresh element_token values may be used for input. Row references are zero-based.\n${JSON.stringify({ ...state, elements: compact, ...(tree === undefined ? {} : { tree_markdown: tree }) })}`
    return delta.length < full.length ? delta : full
  }
}
