/** Plugin detail form backed by DSH's revision-fenced Host settings service. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { createElement as h, useEffect, useState, useSyncExternalStore } from 'react'
import { DisclosureRow, SegmentedControl, SettingsForm, SettingsValueField, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Config } from './index.ts'
import { en, zh, NS, type SettingsLocaleKey } from './settings-locales.ts'
import { draftFrom, settingsEdits, type SettingsDraft } from './settings-model.ts'

export function SettingsPanel({ form, t }: { form: ConfigForm<Config> } & PropsLocale<typeof NS>) {
  const snapshot = useSyncExternalStore(listener => form.subscribe(listener), () => form.getSnapshot())
  const [draft, setDraft] = useState<SettingsDraft>(() => draftFrom(snapshot.value))
  const [revision, setRevision] = useState(snapshot.revision)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<SettingsLocaleKey | undefined>()
  const [failed, setFailed] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  useEffect(() => {
    if (!dirty && !saving) { setDraft(draftFrom(snapshot.value)); setRevision(snapshot.revision) }
  }, [snapshot, dirty, saving])
  const writable = snapshot.status === 'ready' && snapshot.writable && snapshot.mode === 'host' && snapshot.revision !== undefined
  const edit = <K extends keyof SettingsDraft>(field: K, value: SettingsDraft[K]) => { setDraft(current => ({ ...current, [field]: value })); setDirty(true); setMessage(undefined); setFailed(false) }
  async function save() {
    if (!writable || saving || revision === undefined) return
    setSaving(true); setMessage(undefined); setFailed(false)
    try {
      const accepted = await form.mutate(settingsEdits(draft), revision)
      if (!accepted) { setFailed(true); setMessage(form.getSnapshot().revision !== revision ? 'conflict' : 'saveFailed'); return }
      setDirty(false); setMessage('saved')
    } catch { setFailed(true); setMessage('saveFailed') }
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
      // Shared field requires reset props; this form deliberately exposes no reset action.
      overridden: false, overriddenLabel: '', resetLabel: '', invalidLabel: t('invalidNumber'),
      onEdit: (value: string) => edit(key, value), onReset: () => {},
    })
  }
  const approvalHint = t(draft.approval === 'ask' ? 'askHint' : 'inheritHint')
  return h('section', { 'aria-label': t('title') },
    h(SettingsForm, {
      labels: { unavailable: t(snapshot.status === 'loading' ? 'loading' : 'unavailable'), readOnly: t('readOnly'), saveFailed: t(message ?? 'saveFailed'), save: t('save'), saving: t('saving') },
      state: { available: snapshot.status === 'ready', writable, dirty: dirty && writable, invalid, saving, failed },
      onSave: () => { void save() },
      // Drafts are component-local and disappear on unmount; no shared draft to discard.
      onDiscard: () => {},
      children: [
        h('div', { key: 'approval', style: fieldStyle },
          h('div', { style: { ...labelStyle, marginBottom: 8 } }, t('approval')),
          h('div', { style: { maxWidth: 360 } }, h(SegmentedControl<Config['approval']>, {
            id: 'cua-approval', label: t('approval'), value: draft.approval, disabled,
            options: [{ value: 'ask', label: t('ask') }, { value: 'inherit', label: t('inherit') }],
            onChange: (value: Config['approval']) => edit('approval', value),
          })),
          h('p', { id: `cua-approval-${draft.approval}-panel`, role: 'tabpanel', 'aria-labelledby': `cua-approval-${draft.approval}`, style: hintStyle }, approvalHint)),
        h('div', { key: 'native', style: fieldStyle },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 } },
            h('span', { style: labelStyle }, t('native')),
            h(Switch, { label: t('nativeLabel'), checked: draft.native, disabled, onChange: (value: boolean) => edit('native', value) })),
          h('p', { style: hintStyle }, t('nativeHint'))),
        h('div', { key: 'advanced', style: { paddingTop: 12 } },
          h(DisclosureRow, { title: t('advanced'), icon: null, open: advanced, expandable: true, expandOnRowClick: true, onToggle: () => setAdvanced(value => !value) },
            number('timeoutSeconds', t('timeout'), t('timeoutHint')),
            number('idleSeconds', t('idle'), t('idleHint')),
            number('maxTargets', t('targets'), t('targetsHint')))),
        dirty && revision !== snapshot.revision && !(failed && message === 'conflict') ? h('p', { key: 'conflict', role: 'status', style: hintStyle }, t('conflict')) : null,
      ],
    }),
    message && !failed ? h('p', { role: 'status', style: hintStyle }, t(message)) : null)

}

export function registerSettings(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'unified-cua: settings dictionaries')
  const form = ctx.configForms.get<Config>('unified-computer-use')
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: 'dsh-unified-computer-use', locale: NS, inject: () => ({ form }) }, SettingsPanel))
}
