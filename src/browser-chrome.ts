/** Scoped browser chrome. Guests stay mounted while tab metadata and locale update. */
export const NS = 'browser.unified-computer-use'
export const en = {
  tabs: 'Browser tabs', address: 'Page address (read-only)', loading: 'Loading…',
  close: 'Close {title}', empty: 'No open pages',
  emptyHint: 'Ask the assistant to open a website to get started.',
}
export const zh: Record<keyof typeof en, string> = {
  tabs: '浏览器标签', address: '网页地址（只读）', loading: '正在加载…',
  close: '关闭 {title}', empty: '暂无打开的网页',
  emptyHint: '让助手打开一个网站，即可开始浏览。',
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'browser.unified-computer-use': keyof typeof en }
}
type Translate = (key: keyof typeof en, params?: Record<string, unknown>) => string
export interface ChromeTab { id: string; title: string; url: string; active: boolean }

// Use DSH's shared design tokens, scoped to this plugin; never style guest pages.
export const chromeCSS = `
.dsh-cua-browser { display:flex; flex-direction:column; width:100%; height:100%; min-width:0; min-height:0; overflow:hidden; color:var(--dsw-alias-label-primary,#202124); background:var(--dsw-alias-bg-layer-1,#fff); font:13px/20px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
.dsh-cua-browser * { box-sizing:border-box; }
.dsh-cua-browser [hidden] { display:none !important; }
.dsh-cua-browser .cua-tabs { display:flex; gap:4px; flex:none; padding:6px 8px 0; overflow-x:auto; scrollbar-width:thin; }
.dsh-cua-browser .cua-tab { display:flex; align-items:center; flex:0 1 220px; min-width:112px; height:32px; padding:0 4px 0 0; border:0.5px solid transparent; border-radius:var(--dsw-radius-md,8px); color:var(--dsw-alias-label-secondary,#61656d); }
.dsh-cua-browser .cua-tab[data-active=true] { background:var(--dsw-alias-bg-layer-3,#f3f4f6); border-color:var(--dsw-alias-border-l3,#e4e5e7); color:var(--dsw-alias-label-primary,#202124); }
.dsh-cua-browser button { appearance:none; display:flex; align-items:center; gap:7px; border:0; border-radius:var(--dsw-radius-sm,4px); background:transparent; color:inherit; font:inherit; cursor:pointer; }
.dsh-cua-browser button:hover { background:var(--dsw-alias-bg-layer-4,#e9eaed); }
.dsh-cua-browser button:focus-visible, .dsh-cua-browser input:focus-visible { outline:2px solid var(--dsw-alias-state-business-primary,#4b79f7); outline-offset:-2px; }
.dsh-cua-browser .cua-select { min-width:0; flex:1; height:100%; padding:0 8px; text-align:left; }
.dsh-cua-browser .cua-title { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.dsh-cua-browser .cua-close { flex:none; justify-content:center; width:24px; height:24px; padding:4px; color:var(--dsw-alias-label-tertiary,#858a93); }
.dsh-cua-browser svg { flex:none; width:16px; height:16px; }
.dsh-cua-browser .cua-address-row { flex:none; padding:8px; border-bottom:0.5px solid var(--dsw-alias-border-l2,#eee); }
.dsh-cua-browser .cua-address-wrap { display:flex; align-items:center; gap:8px; height:32px; padding:0 10px; border:0.5px solid var(--dsw-alias-border-l4,#ddd); border-radius:var(--dsw-radius-md,8px); color:var(--dsw-alias-label-tertiary,#858a93); }
.dsh-cua-browser .cua-address { width:100%; min-width:0; height:100%; padding:0; border:0; background:transparent; color:var(--dsw-alias-label-secondary,#61656d); font:inherit; text-overflow:ellipsis; }
.dsh-cua-browser .cua-guests { flex:1; min-width:0; min-height:0; }
.dsh-cua-browser .cua-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; padding:28px; text-align:center; }
.dsh-cua-browser .cua-empty>svg { width:28px; height:28px; color:var(--dsw-alias-label-tertiary,#858a93); }
.dsh-cua-browser .cua-empty strong { font-weight:500; font-size:14px; }
.dsh-cua-browser .cua-empty span { max-width:280px; color:var(--dsw-alias-label-tertiary,#858a93); }
`
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string) {
  const node = document.createElement(tag); node.className = className; return node
}
function icon(close = false): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.6')
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(svg.namespaceURI, 'path')
  path.setAttribute('d', close ? 'M6 6l12 12M18 6L6 18' : 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c4 5 4 13 0 18-4-5-4-13 0-18Z')
  svg.append(path); return svg
}
export function createBrowserChrome(select: (id: string) => void, close: (id: string) => void, t: Translate) {
  const node = element('div', 'dsh-cua-browser')
  const nav = element('nav', 'cua-tabs')
  const row = element('div', 'cua-address-row')
  const wrap = element('div', 'cua-address-wrap')
  const address = element('input', 'cua-address'); address.readOnly = true; address.type = 'text'; address.spellcheck = false
  wrap.append(icon(), address); row.append(wrap)
  const guests = element('div', 'cua-guests'); guests.dataset.guests = ''
  const empty = element('div', 'cua-empty'); empty.setAttribute('role', 'status')
  const title = element('strong', ''); const hint = element('span', '')
  empty.append(icon(), title, hint); node.append(nav, row, guests, empty)
  const buttons = new Map<string, { group: HTMLDivElement; select: HTMLButtonElement; close: HTMLButtonElement; label: HTMLSpanElement }>()
  function update(tabs: ChromeTab[]) {
    const focused = document.activeElement
    let restoreIndex = -1
    for (const [id, item] of buttons) {
      if (tabs.some(tab => tab.id === id)) continue
      if (item.group.contains(focused)) restoreIndex = Array.from(nav.children).indexOf(item.group)
      item.group.remove(); buttons.delete(id)
    }
    for (const tab of tabs) {
      let item = buttons.get(tab.id)
      if (!item) {
        const group = element('div', 'cua-tab'); group.dataset.target = tab.id
        const button = element('button', 'cua-select'); button.type = 'button'
        const label = element('span', 'cua-title'); button.append(icon(), label)
        button.onclick = () => { select(tab.id); group.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }
        const remove = element('button', 'cua-close'); remove.type = 'button'; remove.append(icon(true)); remove.onclick = () => close(tab.id)
        group.append(button, remove); nav.append(group)
        item = { group, select: button, close: remove, label }; buttons.set(tab.id, item)
      }
      const name = tab.title || t('loading')
      item.group.dataset.active = String(tab.active)
      item.select.setAttribute('aria-pressed', String(tab.active)); item.select.title = tab.url || name
      item.label.textContent = name; item.close.setAttribute('aria-label', t('close', { title: name })); item.close.title = t('close', { title: name })
    }
    nav.setAttribute('aria-label', t('tabs')); address.setAttribute('aria-label', t('address')); address.title = t('address')
    const url = tabs.find(tab => tab.active)?.url ?? ''
    if (address.value !== url) address.value = url
    address.placeholder = t('loading')
    title.textContent = t('empty'); hint.textContent = t('emptyHint')
    nav.hidden = row.hidden = guests.hidden = tabs.length === 0; empty.hidden = tabs.length > 0
    if (restoreIndex >= 0) {
      const next = tabs[Math.min(restoreIndex, tabs.length - 1)]
      if (next) buttons.get(next.id)!.select.focus()
      else { empty.tabIndex = -1; empty.focus() }
    }
  }
  update([])
  return { node, update }
}
