/** Plugin detail form backed by DSH's revision-fenced Host settings service. */
import type { Context } from '@deepseek-ai/cordis'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { createElement as h, useEffect, useState, useSyncExternalStore } from 'react'
import { Button, DisclosureRow, SegmentedControl, SettingsForm, SettingsValueField, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Config } from './index.ts'
import { errorText } from './errors.ts'
import { draftFrom, settingsEdits, type SettingsDraft } from './settings-model.ts'

export function SettingsPanel({ form }: { form: ConfigForm<Config> }) {
  const snapshot = useSyncExternalStore(listener => form.subscribe(listener), () => form.getSnapshot())
  const [draft, setDraft] = useState<SettingsDraft>(() => draftFrom(snapshot.value))
  const [revision, setRevision] = useState(snapshot.revision)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  useEffect(() => {
    if (!dirty && !saving) { setDraft(draftFrom(snapshot.value)); setRevision(snapshot.revision) }
  }, [snapshot, dirty, saving])
  const writable = snapshot.status === 'ready' && snapshot.writable && snapshot.mode === 'host' && snapshot.revision !== undefined
  const edit = <K extends keyof SettingsDraft>(field: K, value: SettingsDraft[K]) => { setDraft(current => ({ ...current, [field]: value })); setDirty(true); setMessage(''); setFailed(false) }
  const reload = () => { setDraft(draftFrom(snapshot.value)); setRevision(snapshot.revision); setDirty(false); setMessage(''); setFailed(false) }
  async function save() {
    if (!writable || saving || revision === undefined) return
    setSaving(true); setMessage(''); setFailed(false)
    try {
      const accepted = await form.mutate(settingsEdits(draft), revision)
      if (!accepted) throw new Error('设置未保存，可能已在其他页面修改。请先重新载入，再确认你的选择。')
      setDirty(false); setMessage('已保存。后续操作使用新设置；正在执行的调用保留原超时时限。')
    } catch (error) { setFailed(true); setMessage(errorText(error)) }
    finally { setSaving(false) }
  }
  const disabled = !writable || saving
  let invalid = false
  try { settingsEdits(draft) } catch { invalid = true }
  const hintStyle = { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, margin: '6px 0 0', lineHeight: 1.5 }
  const labelStyle = { color: 'var(--dsw-alias-label-primary)', fontSize: 13, fontWeight: 500, lineHeight: 1.5 }
  const fieldStyle = { padding: '12px 0', borderBottom: '0.5px solid var(--dsw-alias-border-l2)' }
  const number = (key: 'timeoutSeconds' | 'idleSeconds' | 'maxTargets', label: string, hint: string) => {
    let invalid = false
    try { settingsEdits({ ...draftFrom(), [key]: draft[key] }) } catch { invalid = true }
    return h(SettingsValueField, {
      id: `cua-settings-${key}`, label, hint, numeric: true, text: draft[key], disabled, invalid,
      overridden: false, overriddenLabel: '已自定义', resetLabel: '恢复默认', invalidLabel: '请输入提示范围内的有效数值。',
      onEdit: (value: string) => edit(key, value), onReset: () => edit(key, draftFrom()[key]),
    })
  }
  const approvalHint = draft.approval === 'ask'
    ? '每段工具调用请求批准，一段可以包含多个操作。'
    : '插件不额外请求确认。DSH 自身仍可要求审批或拒绝。'
  return h('section', { 'aria-label': 'Computer Use 设置' },
    h(SettingsForm, {
      labels: { unavailable: snapshot.status === 'loading' ? '正在加载设置…' : '当前连接无法读取设置，请在本机 DSH Desktop 中打开此插件。', readOnly: '当前连接无法修改设置。', saveFailed: message || '保存失败，请重新载入后重试。', save: '保存设置', saving: '保存中…' },
      state: { available: snapshot.status === 'ready', writable, dirty: dirty && writable, invalid, saving, failed },
      onSave: () => { void save() },
      // Drafts are component-local and disappear on unmount; no shared draft to discard.
      onDiscard: () => {},
      children: [
        h('div', { key: 'approval', style: fieldStyle },
          h('div', { style: { ...labelStyle, marginBottom: 8 } }, '执行确认'),
          h('div', { style: { maxWidth: 360 } }, h(SegmentedControl<Config['approval']>, {
            id: 'cua-approval', label: '执行确认', value: draft.approval, disabled,
            options: [{ value: 'ask', label: '每次确认（默认）' }, { value: 'inherit', label: '跟随 DSH 策略' }],
            onChange: (value: Config['approval']) => edit('approval', value),
          })),
          h('p', { id: `cua-approval-${draft.approval}-panel`, role: 'tabpanel', 'aria-labelledby': `cua-approval-${draft.approval}`, style: hintStyle }, approvalHint)),
        h('div', { key: 'native', style: fieldStyle },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 } },
            h('span', { style: labelStyle }, '原生应用操作'),
            h(Switch, { label: '启用原生应用操作', checked: draft.native, disabled, onChange: (value: boolean) => edit('native', value) })),
          h('p', { style: hintStyle }, '关闭后仅保留内置浏览器操作。原生应用所需的系统权限由 macOS 管理。')),
        h('div', { key: 'advanced', style: { paddingTop: 12 } },
          h(DisclosureRow, { title: '高级设置', icon: null, open: advanced, expandable: true, expandOnRowClick: true, onToggle: () => setAdvanced(value => !value) },
            number('timeoutSeconds', '单次调用超时（秒）', '1–120 秒，默认 30 秒。工具可为单次调用指定时限。'),
            number('idleSeconds', '空闲释放时间（秒）', '10–3600 秒，默认 600 秒。后续调用结束后开始计时，到期清理解释器和标签。'),
            number('maxTargets', '原生目标数量上限', '1–32 个，默认 12 个。降低上限不关闭已有目标；浏览器上限为 12 个。'))),
        dirty && revision !== snapshot.revision ? h('p', { key: 'conflict', role: 'status', style: hintStyle }, '设置已在其他位置更新。重新载入会放弃当前未保存的修改。') : null,
        dirty ? h('div', { key: 'reload', style: { marginTop: 12 } }, h(Button, { variant: 'ghost', size: 'sm', disabled: saving, onClick: reload }, '重新载入')) : null,
      ],
    }),
    message && !failed ? h('p', { role: 'status', style: hintStyle }, message) : null)

}

export function registerSettings(ctx: Context): void {
  const form = ctx.configForms.get<Config>('unified-computer-use')
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: 'dsh-unified-computer-use', inject: () => ({ form }) }, SettingsPanel))
}
