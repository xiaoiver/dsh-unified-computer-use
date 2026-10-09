/** Electron-owned browser tabs with observation-bound CDP element references. */
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, WebContentsView, ipcMain, session, type WebContents } from 'electron'
import { z } from 'zod'
import { result, webUrl, type BrowserAction, type Result } from './protocol.ts'
import type { PreviewTarget } from './pip.ts'

const axNode = z.object({
  ignored: z.boolean(), backendDOMNodeId: z.number().optional(),
  role: z.object({ value: z.string() }).optional(), name: z.object({ value: z.string() }).optional(),
  value: z.object({ value: z.union([z.string(), z.number(), z.boolean()]) }).optional(),
  properties: z.array(z.object({ name: z.string(), value: z.object({ value: z.unknown() }) })).optional(),
})
interface Tab {
  id: string; view: WebContentsView; generation: number; refs: Map<string, number>; closed: boolean
}

/** Every tab belongs to this owner; toolbar IPC cannot address another owner's window. */
export class BrowserSurface {
  private tabs = new Map<string, Tab>()
  private window?: BrowserWindow
  private active?: string
  private channel = `dsh-cua-browser-${randomUUID()}`
  private partition = `dsh-cua-browser-${randomUUID()}`
  private disposed = false
  constructor(
    private hostUrl: () => string | undefined,
    private maxTargets: number,
    private preview: (target: PreviewTarget) => void,
    private invalidatePreview: (id: string) => void,
  ) {
    const browserSession = session.fromPartition(this.partition)
    browserSession.setPermissionRequestHandler((_c, _p, callback) => callback(false))
    browserSession.setPermissionCheckHandler(() => false)
    browserSession.setDevicePermissionHandler(() => false)
    browserSession.setDisplayMediaRequestHandler((_r, callback) => callback({}))
    browserSession.on('will-download', event => event.preventDefault())
    browserSession.webRequest.onBeforeRequest((details, callback) => {
      try {
        const protocol = new URL(details.url).protocol
        if (['http:', 'https:'].includes(protocol)) webUrl(details.url, this.hostUrl())
        else if (['ws:', 'wss:'].includes(protocol)) webUrl(details.url.replace(/^ws/, 'http'), this.hostUrl())
        else if (!['about:', 'data:', 'blob:'].includes(protocol)) throw new Error('Unsupported protocol')
        callback({})
      } catch { callback({ cancel: true }) }
    })
  }

  async execute(op: BrowserAction, signal: AbortSignal): Promise<Result> {
    signal.throwIfAborted()
    if (this.disposed) throw new Error('Browser owner is closed')
    if (op.action === 'list') return result({ tabs: this.describe() })
    if (op.action === 'open') {
      const url = webUrl(op.url, this.hostUrl())
      if (this.tabs.size >= this.maxTargets) throw new Error('Close a tab before opening another')
      await this.ensureWindow()
      signal.throwIfAborted()
      const tab = this.createTab()
      this.select(tab.id, op.visible)
      try {
        await this.navigate(tab.view.webContents, url, signal)
        // Renderer focus is virtual; the desktop window remains in the background.
        await tab.view.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
        signal.throwIfAborted()
        this.showPreview(tab)
        return this.observe(tab, false, signal)
      } catch (error) {
        this.closeTab(tab.id)
        throw error
      }
    }
    const tab = this.requireTab(op.target)
    const contents = tab.view.webContents
    const send = (method: string, params: object = {}) => contents.debugger.sendCommand(method, params)
    if (op.action === 'close') { this.closeTab(tab.id); return result({ closed: tab.id }) }
    if (op.action === 'reveal') { this.select(tab.id, true); return result({ target: tab.id }) }
    if (op.action === 'navigate') {
      const url = webUrl(op.url, this.hostUrl())
      this.invalidate(tab)
      await this.navigate(contents, url, signal)
      signal.throwIfAborted()
      this.showPreview(tab)
      return this.observe(tab, false, signal)
    }
    this.showPreview(tab)
    if (op.action === 'observe') return this.observe(tab, op.screenshot, signal)
    if (op.action === 'click' || op.action === 'fill') {
      const backendNodeId = tab.refs.get(op.ref)
      if (backendNodeId === undefined) throw new Error('Stale element reference; observe this tab again')
      const generation = tab.generation
      if (op.action === 'click') {
        await send('DOM.scrollIntoViewIfNeeded', { backendNodeId })
        const quads = z.object({ quads: z.array(z.array(z.number()).length(8)) }).parse(await send('DOM.getContentQuads', { backendNodeId })).quads
        if (quads.length !== 1) throw new Error('Element has no unique visible box; observe again')
        const q = quads[0]!
        const x = (q[0]! + q[2]! + q[4]! + q[6]!) / 4
        const y = (q[1]! + q[3]! + q[5]! + q[7]!) / 4
        // A compositor round trip prevents a just-created hidden view from dropping input.
        await send('Page.captureScreenshot', { format: 'jpeg', quality: 1 })
        signal.throwIfAborted()
        if (generation !== tab.generation) throw new Error('Page changed before input')
        this.invalidate(tab)
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' })
        signal.throwIfAborted()
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
      } else {
        const description = z.object({ node: z.object({ attributes: z.array(z.string()).optional() }) }).parse(await send('DOM.describeNode', { backendNodeId }))
        const attrs = description.node.attributes ?? []
        for (let i = 0; i < attrs.length; i += 2) {
          if (attrs[i] === 'type' && attrs[i + 1]?.toLowerCase() === 'password') throw new Error('Enter passwords manually in the browser')
        }
        await send('DOM.focus', { backendNodeId })
        signal.throwIfAborted()
        if (generation !== tab.generation) throw new Error('Page changed before input')
        this.invalidate(tab)
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: process.platform === 'darwin' ? 4 : 2, commands: ['selectAll'] })
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 0 })
        await send('Input.insertText', { text: op.text })
      }
    } else if (op.action === 'press') {
      this.invalidate(tab)
      const codes = { Enter: 13, Tab: 9, Escape: 27, Backspace: 8, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39 }
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: op.key, code: op.key, windowsVirtualKeyCode: codes[op.key], ...(op.key === 'Enter' ? { text: '\r' } : {}) })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: op.key, code: op.key, windowsVirtualKeyCode: codes[op.key] })
    } else if (op.action === 'scroll') {
      this.invalidate(tab)
      const bounds = tab.view.getBounds()
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: bounds.width / 2, y: bounds.height / 2, deltaX: op.x, deltaY: op.y })
    }
    signal.throwIfAborted()
    return result({ target: tab.id, delivered: true, next: 'Observe to verify the result and obtain fresh element references.' })
  }

  private async observe(tab: Tab, screenshot: boolean, signal: AbortSignal): Promise<Result> {
    this.invalidate(tab)
    const generation = tab.generation
    const contents = tab.view.webContents
    const tree = z.object({ nodes: z.array(axNode) }).parse(await contents.debugger.sendCommand('Accessibility.getFullAXTree'))
    signal.throwIfAborted()
    if (generation !== tab.generation || tab.closed) throw new Error('Page navigated during observation; observe again')
    const elements = tree.nodes.filter(n => !n.ignored).slice(0, 500).map((node, i) => {
      const ref = `${generation}:${i}`
      if (node.backendDOMNodeId !== undefined) tab.refs.set(ref, node.backendDOMNodeId)
      const protectedValue = node.properties?.some(p => p.name === 'protected' && p.value.value === true)
      return { ref, role: node.role?.value ?? '', name: (node.name?.value ?? '').slice(0, 300), value: protectedValue ? '••••' : String(node.value?.value ?? '').slice(0, 1000) }
    })
    const response = result({ target: tab.id, url: contents.getURL(), title: contents.getTitle(), elements, truncated: tree.nodes.filter(n => !n.ignored).length > 500 })
    if (screenshot) {
      const image = z.object({ data: z.string() }).parse(await contents.debugger.sendCommand('Page.captureScreenshot', { format: 'png' }))
      signal.throwIfAborted()
      if (generation !== tab.generation) throw new Error('Page changed while capturing screenshot')
      response.content.push({ type: 'image', mimeType: 'image/png', data: image.data })
    }
    return response
  }

  private async navigate(contents: WebContents, url: string, signal: AbortSignal): Promise<void> {
    const stop = () => { if (!contents.isDestroyed()) contents.stop() }
    signal.throwIfAborted()
    signal.addEventListener('abort', stop, { once: true })
    try { await contents.loadURL(url); signal.throwIfAborted() }
    finally { signal.removeEventListener('abort', stop) }
  }

  private createTab(): Tab {
    const view = new WebContentsView({ webPreferences: { partition: this.partition, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, webSecurity: true, disableDialogs: true } })
    const tab: Tab = { id: randomUUID(), view, generation: 0, refs: new Map(), closed: false }
    this.tabs.set(tab.id, tab)
    const contents = view.webContents
    contents.debugger.attach('1.3')
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (event, url) => {
      try { webUrl(url, this.hostUrl()) } catch { event.preventDefault() }
    })
    contents.on('will-redirect', (event, url) => {
      try { webUrl(url, this.hostUrl()) } catch { event.preventDefault() }
    })
    contents.on('did-start-navigation', (_e, _url, inPlace, main) => { if (main && !inPlace) { this.invalidate(tab); this.invalidatePreview(tab.id) } })
    contents.on('did-finish-load', () => { this.publish(); this.showPreview(tab) })
    contents.on('page-title-updated', () => this.publish())
    contents.on('destroyed', () => { tab.closed = true; this.tabs.delete(tab.id); this.invalidatePreview(tab.id); this.publish() })
    contents.on('render-process-gone', () => this.closeTab(tab.id))
    return tab
  }
  private invalidate(tab: Tab): void { tab.generation++; tab.refs.clear() }
  invalidateAll(): void { for (const tab of this.tabs.values()) this.invalidate(tab) }
  private requireTab(id: string): Tab {
    const tab = this.tabs.get(id)
    if (!tab || tab.closed || tab.view.webContents.isDestroyed()) throw new Error('Tab is closed or belongs to another session')
    return tab
  }
  private showPreview(tab: Tab): void {
    if (tab.closed) return
    this.preview({ id: tab.id, title: () => tab.view.webContents.getTitle(), valid: () => !tab.closed && !tab.view.webContents.isDestroyed(),
      source: async () => tab.view.webContents.mainFrame, reveal: async () => this.select(tab.id, true) })
  }
  private describe() { return [...this.tabs.values()].map(tab => ({ target: tab.id, title: tab.view.webContents.getTitle(), url: tab.view.webContents.getURL(), active: tab.id === this.active })) }
  private publish(): void { if (this.window && !this.window.isDestroyed()) this.window.webContents.send(this.channel, this.describe()) }
  private select(id: string, visible: boolean): void {
    const tab = this.requireTab(id)
    const window = this.window!
    if (this.active) {
      const old = this.tabs.get(this.active)
      if (old) window.contentView.removeChildView(old.view)
    }
    this.active = id
    window.contentView.addChildView(tab.view)
    this.resize()
    this.publish()
    if (visible) { window.show(); window.focus() }
  }
  private resize(): void {
    const tab = this.active ? this.tabs.get(this.active) : undefined
    if (!tab || !this.window) return
    const [width, height] = this.window.getContentSize()
    tab.view.setBounds({ x: 0, y: 92, width, height: Math.max(1, height - 92) })
  }
  private async ensureWindow(): Promise<void> {
    if (this.window && !this.window.isDestroyed()) return
    const window = this.window = new BrowserWindow({ width: 1100, height: 780, show: false, title: 'DSH Browser',
      webPreferences: { preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)), sandbox: true, contextIsolation: true, nodeIntegration: false, additionalArguments: [`--dsh-cua-channel=${this.channel}`] } })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', e => e.preventDefault())
    ipcMain.handle(this.channel, async (event, input: unknown) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Invalid browser toolbar sender')
      const op = z.discriminatedUnion('action', [
        z.object({ action: z.literal('state') }), z.object({ action: z.literal('select'), target: z.string().uuid() }),
        z.object({ action: z.literal('close'), target: z.string().uuid() }), z.object({ action: z.literal('navigate'), url: z.string().max(8192) }),
        z.object({ action: z.literal('back') }), z.object({ action: z.literal('forward') }), z.object({ action: z.literal('reload') }),
      ]).parse(input)
      if (op.action === 'select') this.select(op.target, true)
      else if (op.action === 'close') this.closeTab(op.target)
      else if (this.active && op.action !== 'state') {
        const tab = this.requireTab(this.active)
        const contents = tab.view.webContents
        this.invalidate(tab)
        if (op.action === 'navigate') await contents.loadURL(webUrl(op.url, this.hostUrl()))
        else if (op.action === 'back' && contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack()
        else if (op.action === 'forward' && contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward()
        else if (op.action === 'reload') contents.reload()
      }
      return this.describe()
    })
    window.on('resize', () => this.resize())
    window.on('close', event => { if (!this.disposed) { event.preventDefault(); window.hide() } })
    window.on('closed', () => { ipcMain.removeHandler(this.channel); this.window = undefined })
    await window.loadFile(fileURLToPath(new URL('./browser.html', import.meta.url)))
  }
  private closeTab(id: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    tab.closed = true
    this.tabs.delete(id)
    this.invalidatePreview(id)
    this.window?.contentView.removeChildView(tab.view)
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close({ waitForBeforeUnload: false })
    if (this.active === id) {
      this.active = undefined
      const next = this.tabs.keys().next().value
      if (next) this.select(next, false)
    }
    this.publish()
  }
  dispose(): void {
    this.disposed = true
    for (const id of [...this.tabs.keys()]) this.closeTab(id)
    this.window?.destroy()
    ipcMain.removeHandler(this.channel)
  }
}
