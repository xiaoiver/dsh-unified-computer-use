import type { Config } from './index.ts'
export interface SettingsDraft { native: boolean; timeoutSeconds: string; idleSeconds: string; maxTargets: string }
export function draftFrom(value?: Config): SettingsDraft {
  return { native: value?.native ?? true, timeoutSeconds: String((value?.timeoutMs ?? 30000) / 1000), idleSeconds: String((value?.idleTimeoutMs ?? 600000) / 1000), maxTargets: String(value?.maxTargets ?? 12) }
}
export function settingsEdits(draft: SettingsDraft) {
  function number(value: string, scale: number, min: number, max: number, label: string): number {
    const parsed = Math.round(Number(value) * scale)
    const format = scale === 1 ? /^\d+$/ : /^\d+(?:\.\d{1,3})?$/
    if (!format.test(value.trim()) || !Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`${label}超出允许范围或格式不正确`)
    return parsed
  }
  if (typeof draft.native !== 'boolean') throw new Error('设置选项无效')
  const values: Config = { native: draft.native,
    timeoutMs: number(draft.timeoutSeconds, 1000, 1000, 120000, '调用超时'),
    idleTimeoutMs: number(draft.idleSeconds, 1000, 10000, 3600000, '空闲释放时间'),
    maxTargets: number(draft.maxTargets, 1, 1, 32, '目标上限') }
  return Object.entries(values).map(([key, value]) => ({ op: 'set' as const, path: [key], value }))
}
