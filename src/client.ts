/** Desktop client extension: leased, plugin-owned webviews in DSH's right sidebar. */
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { createElement, useEffect, useRef } from 'react'
import type { BrowserEnvelope } from './browser-broker.ts'
import { browserAction, result, type Result } from './protocol.ts'
import { errorText } from './errors.ts'
import { registerSettings } from './settings-client.ts'

interface Bridge {
  acquire(workspace: string): Promise<{ lease: string; partition: string }>
  release(lease: string): Promise<void>
}
interface Webview extends HTMLElement {
  loadURL(url: string): Promise<void>
  executeJavaScript(code: string): Promise<unknown>
  getURL(): string
  getTitle(): string
  capturePage(): Promise<{ toDataURL(): string }>
  sendInputEvent(event: object): void
}
interface Target { id: string; owner: string; session: string; view: Webview; lease: string; key: string; observed: boolean; revision: number }
export const inject = ['connection', 'slots', 'sidebarRight', 'sidebarRightTabs']
const ID = 'dsh-unified-computer-use/browser'
const KIND = 'cua-browser'
const style = { width: '100%', height: '100%', minHeight: 240 }
function safeURL(input: string): string {
  const url = new URL(input)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Browser URL must be HTTP(S), without credentials')
  return url.href
}
export function apply(ctx: Context): void {
  ctx.inject(['configForms'], registerSettings)
  const connection = ctx.connection as unknown as ConnectionHandle
  const desktop = (globalThis as typeof globalThis & { dshDesktop?: { protocolVersion: number; browser?: Bridge } }).dshDesktop
  if (desktop?.protocolVersion !== 1 || !desktop.browser || location.protocol !== 'dsh-app:' || location.hostname !== 'app') return
  const bridge = desktop.browser
  const client = crypto.randomUUID()
  const lifetime = new AbortController()
  const targets = new Map<string, Target>()
  const containers = new Map<string, HTMLElement>()
  const owners = new Set<string>()
  const bodies = new Map<string, HTMLElement>()
  const waits = new Map<string, Set<() => void>>()
  const closing = new Set<string>()
  function panel(session: string): HTMLElement {
    let node = containers.get(session)
    if (!node) {
      node = document.createElement('div'); Object.assign(node.style, { ...style, position: 'relative', display: 'flex', flexDirection: 'column' })
      const tabs = document.createElement('nav'); tabs.setAttribute('aria-label', 'Computer Use tabs'); tabs.style.cssText = 'display:flex;gap:4px;padding:8px;overflow:auto;flex-shrink:0'
      const address = document.createElement('div'); address.dataset.address = ''; address.style.cssText = 'padding:4px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12px monospace;flex-shrink:0'
      address.textContent = 'No browser tabs'
      const guests = document.createElement('div'); guests.dataset.guests = ''; guests.style.cssText = 'flex:1;min-height:0'
      node.append(tabs, address, guests); containers.set(session, node)
    }
    return node
  }
  function Body(props: PropsRuntime<'sidebar.right.pane.tab'> & { sessionId: string }) {
    const root = useRef<HTMLDivElement>(null)
    const session = String(props.sessionId)
    useEffect(() => {
      const element = root.current!
      // Only one body owns each session's live guest container.
      bodies.set(session, element); element.append(panel(session))
      for (const resolve of waits.get(session) ?? []) resolve()
      waits.delete(session)
      return () => { if (bodies.get(session) === element) { bodies.delete(session); panel(session).remove(); for (const target of targets.values()) if (target.session === session) void drop(target) } }
    }, [session])
    return createElement('div', { ref: root, style })
  }
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: ID, kind: KIND, multiple: false, keepMounted: true, priority: 'extension', title: () => 'Computer Use' }))
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: ID, inject: sessionId => ({ sessionId }) }, Body)))
  async function drop(target: Target) {
    targets.delete(target.id); target.view.remove()
    refreshChrome(target.session)
    await bridge.release(target.lease).catch(() => {})
  }
  async function release(owner: string) {
    owners.delete(owner); closing.add(owner)
    await Promise.all([...targets.values()].filter(t => t.owner === owner).map(drop))
  }
  async function show(session: string, signal: AbortSignal) {
    ctx.sidebarRight.openTabIn(session as SessionId, KIND)
    if (bodies.has(session)) return
    await new Promise<void>((resolve, reject) => {
      const finish = () => { signal.removeEventListener('abort', abort); waits.get(session)?.delete(finish); resolve() }
      const abort = () => { waits.get(session)?.delete(finish); reject(new Error('Browser sidebar did not mount before the operation deadline')) }
      const list = waits.get(session) ?? new Set(); list.add(finish); waits.set(session, list)
      signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort()
    })
  }
  function check(command: BrowserEnvelope, signal: AbortSignal): void {
    signal.throwIfAborted()
    if (!owners.has(command.owner) || closing.has(command.owner) || Date.now() >= command.deadline) throw new Error('Browser operation expired or its session was reset')
  }
  function visible(target: Target): void {
    for (const other of targets.values()) if (other.view.parentElement === target.view.parentElement) other.view.style.display = other === target ? 'flex' : 'none'
    refreshChrome(target.session)
  }
  function refreshChrome(session: string): void {
    const container = panel(session)
    const nav = container.querySelector('nav')!
    nav.replaceChildren()
    const available = [...targets.values()].filter(target => target.session === session)
    if (available.length && !available.some(target => target.view.style.display !== 'none')) available[0].view.style.display = 'flex'
    let address = 'No browser tabs'
    for (const target of available) {
      let url = 'Loading…'; let title = 'Loading…'
      try { url = target.view.getURL(); title = target.view.getTitle() || url } catch { /* guest is attaching */ }
      const button = document.createElement('button'); button.type = 'button'; button.textContent = title.slice(0,60); button.title = url
      button.setAttribute('aria-pressed', String(target.view.style.display !== 'none')); button.onclick = () => visible(target)
      const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', `Close ${title}`); close.onclick = () => { void drop(target) }
      nav.append(button, close)
      if (target.view.style.display !== 'none') address = url
    }
    container.querySelector('[data-address]')!.textContent = address
  }
  async function execute(command: BrowserEnvelope): Promise<Result> {
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(Math.max(1, command.deadline - Date.now()))])
    check(command, signal)
    const op = browserAction.parse(command.operation)
    if (op.action === 'list') return result({ tabs: [...targets.values()].filter(t => t.owner === command.owner).map(t => ({ target: t.id, url: t.view.getURL(), title: t.view.getTitle() })) })
    let target: Target
    if (op.action === 'open') {
      const url = safeURL(op.url)
      if ([...targets.values()].filter(t => t.owner === command.owner).length >= 12) throw new Error('Close a browser target before opening another')
      await show(command.session, signal); check(command, signal)
      const grant = await bridge.acquire(command.workspace)
      try {
        check(command, signal)
        const view = document.createElement('webview') as Webview
        view.setAttribute('partition', grant.partition)
        view.setAttribute('src', `about:blank#${grant.lease}`)
        Object.assign(view.style, { width: '100%', height: '100%', display: 'flex' })
        target = { id: crypto.randomUUID(), owner: command.owner, session: command.session, lease: grant.lease, view, key: `__dsh_cua_${crypto.randomUUID().replaceAll('-', '')}`, observed: false, revision: 0 }
        const loaded = new Promise<void>((resolve, reject) => {
          const done = () => { signal.removeEventListener('abort', abort); resolve() }
          const abort = () => { view.removeEventListener('dom-ready', done); reject(new Error('Browser creation canceled')) }
          view.addEventListener('dom-ready', done, { once: true }); signal.addEventListener('abort', abort, { once: true })
        })
        view.addEventListener('did-start-navigation', () => { target.observed = false; target.revision++ })
        view.addEventListener('did-stop-loading', () => refreshChrome(command.session))
        view.addEventListener('page-title-updated', () => refreshChrome(command.session))
        targets.set(target.id, target); panel(command.session).querySelector('[data-guests]')!.append(view); visible(target)
        await loaded; check(command, signal)
        await view.loadURL(url); check(command, signal)
      } catch (error) {
        for (const item of targets.values()) if (item.lease === grant.lease) await drop(item)
        await bridge.release(grant.lease).catch(() => {})
        throw error
      }
    } else {
      const selected = targets.get(op.target)
      if (!selected || selected.owner !== command.owner) throw new Error('Browser target is closed or belongs to another session')
      target = selected
    }
    if (op.action === 'close') { await drop(target); return result({ closed: target.id }) }
    if (op.action === 'reveal') { await show(command.session, signal); visible(target); return result({ target: target.id }) }
    if (op.action === 'navigate') { target.observed = false; await target.view.loadURL(safeURL(op.url)); check(command, signal) }
    const key = JSON.stringify(target.key)
    if (op.action === 'click' || op.action === 'fill') {
      if (!target.observed) throw new Error('Observe this browser target before each input')
      target.observed = false
      check(command, signal)
      const operation = JSON.stringify(op)
      await target.view.executeJavaScript(`(() => { const op = ${operation}; const state = window[${key}]; const el = state?.get(op.ref); if (!el?.isConnected) throw Error('Stale browser ref'); if (el.matches('input[type=password], input[type=file]')) throw Error('Use the browser manually for this field'); if (el.disabled || el.readOnly) throw Error('Element is not editable'); if (op.action === 'click') { el.click(); return; } if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) throw Error('Fill requires an input or textarea'); Object.getOwnPropertyDescriptor(el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, 'value').set.call(el, op.text); el.dispatchEvent(new Event('input', { bubbles:true })); el.dispatchEvent(new Event('change', { bubbles:true })); })()`)
      check(command, signal)
    }
    if (op.action === 'scroll') { check(command, signal); target.observed = false; await target.view.executeJavaScript(`window.scrollBy(${op.x}, ${op.y})`) }
    if (op.action === 'press') throw new Error('Keyboard input is not yet verified through the DSH webview API; use click/fill or interact manually')
    const revision = target.revision
    const observation = await target.view.executeJavaScript(`(() => { const map = new Map(); window[${key}] = map; const prefix = ${JSON.stringify(crypto.randomUUID())}; const elements = [...document.querySelectorAll('a,button,input,textarea,select,[role=button]')].filter(el => el.getClientRects().length).slice(0,300).map((el,i) => { const ref=prefix+':'+i; map.set(ref,el); return {ref,tag:el.tagName.toLowerCase(),label:(el.getAttribute('aria-label')||el.textContent||el.getAttribute('placeholder')||'').slice(0,300),type:el.getAttribute('type')}; }); return {title:document.title,url:location.href,text:document.body?.innerText.slice(0,20000)||'',elements}; })()`)
    check(command, signal)
    if (revision !== target.revision) throw new Error('Browser navigated during observation; observe again')
    target.observed = true
    const response = result({ target: target.id, ...(observation as Record<string, never>) })
    if (op.action === 'observe' && op.screenshot) {
      const image = (await target.view.capturePage()).toDataURL()
      check(command, signal)
      response.content.push({ type: 'image', mimeType: 'image/png', data: image.split(',')[1] })
    }
    return response
  }
  const running = new Set<Promise<void>>()
  async function loop(): Promise<void> {
    while (!lifetime.signal.aborted) {
      try {
        const reply = await connection.rpc.call('/api', 'unified-cua/poll', { client, session: ctx.sidebarRight.mounted.getSnapshot() }, lifetime.signal)
        if (!reply.ok) throw new Error(reply.error.message)
        const value = reply.value as { commands: BrowserEnvelope[]; owners: string[] }
        for (const id of owners) if (!value.owners.includes(id)) await release(id)
        for (const id of value.owners) if (!closing.has(id)) owners.add(id)
        for (const command of value.commands) {
          const task = (async () => {
            let answer: { result: Result } | { error: string }
            try { answer = { result: await execute(command) } } catch (error) { answer = { error: errorText(error) } }
            await connection.rpc.call('/api', 'unified-cua/reply', { client, id: command.id, ...answer }, lifetime.signal).catch(() => {})
          })()
          running.add(task); void task.finally(() => running.delete(task))
        }
      } catch {
        await Promise.all([...owners].map(release))
        if (!lifetime.signal.aborted) await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }
  ctx.effect(() => { void loop(); return async () => { lifetime.abort(); await Promise.all([...owners].map(release)); await Promise.allSettled([...running]); for (const node of containers.values()) node.remove() } })
}
