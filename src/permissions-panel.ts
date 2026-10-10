import { createElement as h, useEffect, useMemo, useSyncExternalStore } from 'react'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginActivationOwnerProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { PermissionsApi, Permission } from './permissions-contract.ts'
import { NS } from './settings-locales.ts'
import { PermissionSetup } from './permissions-model.ts'

type Copy = PropsLocale<typeof NS>
const hintStyle = { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, margin: '6px 0', lineHeight: 1.5 }

export function PermissionsPanel({ api, t }: { api: PermissionsApi } & Copy) {
  const setup = useMemo(() => new PermissionSetup(api), [api])
  const snapshot = useSyncExternalStore(setup.subscribe, setup.getSnapshot)
  const { status: state, busy, failure, requested } = snapshot
  useEffect(() => {
    setup.start()
    const focus = () => { void setup.query() }
    window.addEventListener('focus', focus)
    return () => { setup.stop(); window.removeEventListener('focus', focus) }
  }, [setup])
  const mac = state?.platform === 'darwin'
  const canRequest = mac && state.nativeEnabled && !busy
  const granted = state?.accessibility === 'granted' && state.screenRecording === 'granted'
  const row = (permission: Permission, label: string) => h('div', { key: permission, style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, margin: '10px 0' } },
    h('span', { style: { flex: 1, minWidth: 140, fontSize: 13 } }, label),
    h(StateDot, { state: state?.[permission] === 'granted' ? 'done' : state?.[permission] === 'unsupported' ? 'idle' : state ? 'warning' : 'ongoing' }),
    h('span', { style: { fontSize: 12 }, role: 'status' }, t(state?.[permission] ?? 'permissionChecking')),
    mac ? h(Button, { size: 'sm', type: 'button', disabled: !canRequest, onClick: () => { void setup.openSettings(permission) } }, t('permissionOpenSettings')) : null)
  return h('section', { 'aria-label': t('permissionsTitle'), 'aria-busy': busy, style: { padding: '12px 0', borderBottom: '0.5px solid var(--dsw-alias-border-l2)' } },
    h('h3', { style: { fontSize: 13, fontWeight: 500, margin: 0, color: 'var(--dsw-alias-label-primary)' } }, t('permissionsTitle')),
    h('p', { style: hintStyle }, t('permissionsHint')),
    failure ? h('div', { role: 'alert' },
      h('p', { style: hintStyle }, t(failure.operation === 'request' ? 'permissionsRequestFailed' : failure.operation === 'openSettings' ? 'permissionsSettingsFailed' : 'permissionsFailed')),
      h('details', { style: hintStyle }, h('summary', null, t('permissionsErrorDetails')),
        h('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, [failure.code, failure.message].filter(Boolean).join(': ')))) : null,
    state || !failure ? [row('accessibility', t('permissionAccessibility')), row('screenRecording', t('permissionScreenRecording'))] : null,
    state && !mac ? h('p', { style: hintStyle }, t('permissionsUnsupported')) : null,
    mac && !state.nativeEnabled ? h('p', { style: hintStyle }, t('permissionsEnableFirst')) : null,
    requested && mac && !granted ? h('p', { role: 'status', style: hintStyle }, t('permissionsPending')) : null,
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 } },
      mac && !granted ? h(Button, { variant: 'outline', size: 'sm', type: 'button', disabled: !canRequest, onClick: () => { void setup.request() } }, t('permissionsAuthorize')) : null,
      h(Button, { size: 'sm', type: 'button', disabled: busy, onClick: () => { void setup.query() } }, t('permissionsRefresh'))))
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
