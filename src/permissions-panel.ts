import { createElement as h, useEffect, useRef, useState } from 'react'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginActivationOwnerProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { PermissionsApi, PermissionsState, Permission } from './permissions-contract.ts'
import { NS } from './settings-locales.ts'

type Copy = PropsLocale<typeof NS>
const hintStyle = { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, margin: '6px 0', lineHeight: 1.5 }

export function PermissionsPanel({ api, t }: { api: PermissionsApi } & Copy) {
  const [state, setState] = useState<PermissionsState>()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [requested, setRequested] = useState(false)
  const mounted = useRef(false)
  const active = useRef(false)
  async function run(action: () => Promise<PermissionsState>, request = false) {
    if (active.current) return
    active.current = true
    setBusy(true); setFailed(false)
    try {
      const next = await action()
      if (mounted.current) { setState(next); if (request) setRequested(true) }
    } catch { if (mounted.current) { setState(undefined); setFailed(true) } }
    finally { active.current = false; if (mounted.current) setBusy(false) }
  }
  useEffect(() => {
    mounted.current = true
    void run(() => api.query())
    // Re-read when the user returns from System Settings; never request on focus.
    const focus = () => { void run(() => api.query()) }
    window.addEventListener('focus', focus)
    return () => { mounted.current = false; window.removeEventListener('focus', focus) }
  }, [api])
  const mac = state?.platform === 'darwin'
  const canRequest = mac && state.nativeEnabled && !busy
  const granted = state?.accessibility === 'granted' && state.screenRecording === 'granted'
  const row = (permission: Permission, label: string) => h('div', { key: permission, style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, margin: '10px 0' } },
    h('span', { style: { flex: 1, minWidth: 140, fontSize: 13 } }, label),
    h(StateDot, { state: state?.[permission] === 'granted' ? 'done' : state?.[permission] === 'unsupported' ? 'idle' : state ? 'warning' : 'ongoing' }),
    h('span', { style: { fontSize: 12 }, role: 'status' }, t(state?.[permission] ?? 'permissionChecking')),
    mac ? h(Button, { size: 'sm', type: 'button', disabled: !canRequest, onClick: () => { void run(() => api.openSettings(permission)) } }, t('permissionOpenSettings')) : null)
  return h('section', { 'aria-label': t('permissionsTitle'), 'aria-busy': busy, style: { padding: '12px 0', borderBottom: '0.5px solid var(--dsw-alias-border-l2)' } },
    h('h3', { style: { fontSize: 13, fontWeight: 500, margin: 0, color: 'var(--dsw-alias-label-primary)' } }, t('permissionsTitle')),
    h('p', { style: hintStyle }, t('permissionsHint')),
    failed ? h('p', { role: 'alert', style: hintStyle }, t('permissionsFailed')) : null,
    state || !failed ? [row('accessibility', t('permissionAccessibility')), row('screenRecording', t('permissionScreenRecording'))] : null,
    state && !mac ? h('p', { style: hintStyle }, t('permissionsUnsupported')) : null,
    mac && !state.nativeEnabled ? h('p', { style: hintStyle }, t('permissionsEnableFirst')) : null,
    requested && mac && !granted ? h('p', { role: 'status', style: hintStyle }, t('permissionsPending')) : null,
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 } },
      mac && !granted ? h(Button, { variant: 'outline', size: 'sm', type: 'button', disabled: !canRequest, onClick: () => { void run(() => api.request(), true) } }, t('permissionsAuthorize')) : null,
      h(Button, { size: 'sm', type: 'button', disabled: busy, onClick: () => { void run(() => api.query()) } }, t('permissionsRefresh'))))
}

/** Rendered by the manager only after a user-requested bundle activation. */
export function PermissionsOnboarding({ onOpenDetails, onDismiss, t }: PluginActivationOwnerProps & Copy) {
  return h('section', { 'aria-label': t('permissionsOnboardingTitle') },
    h('p', { style: { fontSize: 13, fontWeight: 500, margin: '0 0 6px' } }, t('permissionsOnboardingTitle')),
    h('p', { style: hintStyle }, t('permissionsOnboardingHint')),
    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
      h(Button, { variant: 'outline', size: 'sm', type: 'button', onClick: onOpenDetails }, t('permissionsConfigure')),
      h(Button, { size: 'sm', type: 'button', onClick: onDismiss }, t('permissionsLater'))))
}
