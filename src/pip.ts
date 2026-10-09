/** Exact-source display media in disposable, non-activating Electron windows. */
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, ipcMain, screen, type Rectangle, type Streams } from 'electron'
import { z } from 'zod'

export interface PreviewTarget {
  id: string
  title(): string
  valid(): boolean
  source(signal: AbortSignal): Promise<NonNullable<Streams['video']>>
  reveal(): Promise<void>
}
interface Entry {
  target: PreviewTarget; window?: BrowserWindow; lifetime?: AbortController
  bounds?: Rectangle; channel?: string; dismissed: boolean
}

/** Keep a preview entirely inside the available display, preserving its aspect ratio. */
export function fitPreview(area: Rectangle, index: number, previous?: Rectangle): Rectangle {
  const width = Math.min(previous?.width ?? 480, 720, Math.max(80, area.width - 24))
  const height = Math.min(previous?.height ?? 300, 500, Math.max(80, area.height - 24))
  return { width, height,
    x: Math.max(area.x + 12, Math.min(previous?.x ?? area.x + area.width - width - 16 - index * 24, area.x + area.width - width - 12)),
    y: Math.max(area.y + 12, Math.min(previous?.y ?? area.y + 16 + index * 28, area.y + area.height - height - 12)),
  }
}

/** Each instance is a single live Agent's previews and suppression state. */
export class PreviewWindows {
  private entries = new Map<string, Entry>()
  private active = true
  private disposed = false
  constructor(private enabled: boolean) {}

  touch(target: PreviewTarget): void {
    if (!this.enabled || this.disposed || !target.valid()) return
    let entry = this.entries.get(target.id)
    if (!entry) { entry = { target, dismissed: false }; this.entries.set(target.id, entry) }
    else entry.target = target
    if (this.active && !entry.dismissed && !entry.window) {
      void this.open(entry).catch(error => console.error('DSH preview failed:', error instanceof Error ? error.message : String(error)))
    }
  }
  invalidate(id: string): void {
    const entry = this.entries.get(id)
    if (entry) this.destroy(entry)
    this.entries.delete(id)
  }
  suspend(): void { this.active = false; for (const entry of this.entries.values()) this.destroy(entry) }
  resume(): void {
    if (this.disposed || this.active) return
    this.active = true
    for (const entry of this.entries.values()) { entry.dismissed = false; this.touch(entry.target) }
  }
  private async open(entry: Entry): Promise<void> {
    if (!this.active || this.disposed || !entry.target.valid()) return
    const channel = entry.channel = `dsh-cua-pip-${randomUUID()}`
    const lifetime = entry.lifetime = new AbortController()
    const bounds = fitPreview(screen.getPrimaryDisplay().workArea, [...this.entries.values()].indexOf(entry), entry.bounds)
    const window = entry.window = new BrowserWindow({ ...bounds, show: false, frame: false, alwaysOnTop: true, skipTaskbar: true,
      resizable: true, minimizable: false, maximizable: false, fullscreenable: false, title: 'DSH Computer Use',
      webPreferences: { preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)), partition: `dsh-cua-pip-${randomUUID()}`,
        sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, additionalArguments: [`--dsh-cua-channel=${channel}`] } })
    const contents = window.webContents
    const receiverUrl = new URL('./pip.html', import.meta.url).href
    const valid = () => !this.disposed && this.active && !lifetime.signal.aborted && entry.window === window && !window.isDestroyed() && entry.target.valid()
    let requested = false
    const mediaSession = contents.session
    mediaSession.setPermissionCheckHandler(() => false)
    mediaSession.setDevicePermissionHandler(() => false)
    mediaSession.setPermissionRequestHandler((sender, permission, callback, details) => {
      const display = permission === 'display-capture' || (permission === 'media' && 'mediaTypes' in details && details.mediaTypes?.length === 0)
      callback(display && sender === contents && details.isMainFrame && details.requestingUrl === receiverUrl && valid())
    })
    mediaSession.setDisplayMediaRequestHandler((request, callback) => {
      if (!valid() || requested || request.frame !== contents.mainFrame || request.frame.url !== receiverUrl || !request.videoRequested || request.audioRequested) { callback({}); return }
      requested = true
      void entry.target.source(lifetime.signal).then(video => {
        callback(valid() && request.frame === contents.mainFrame && request.frame.url === receiverUrl ? { video } : {})
      }, () => callback({}))
    })
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', event => event.preventDefault())
    contents.on('will-attach-webview', event => event.preventDefault())
    ipcMain.handle(channel, async (event, input: unknown) => {
      if (event.sender !== contents || event.senderFrame !== contents.mainFrame || !valid()) throw new Error('Preview lease expired')
      const op = z.discriminatedUnion('action', [
        z.object({ action: z.literal('state') }), z.object({ action: z.literal('close') }), z.object({ action: z.literal('reveal') }),
        z.object({ action: z.literal('video'), width: z.number().positive(), height: z.number().positive() }),
        z.object({ action: z.literal('ended') }),
      ]).parse(input)
      if (op.action === 'close' || op.action === 'ended') { entry.dismissed = true; this.destroy(entry) }
      if (op.action === 'reveal') { await entry.target.reveal(); entry.dismissed = true; this.destroy(entry) }
      if (op.action === 'video' && !window.isDestroyed()) {
        window.setAspectRatio(op.width / op.height, { width: 0, height: 38 })
      }
      return { title: entry.target.valid() ? entry.target.title() : 'Target closed' }
    })
    window.on('close', () => { entry.dismissed = true })
    window.on('closed', () => {
      lifetime.abort()
      ipcMain.removeHandler(channel)
      mediaSession.setDisplayMediaRequestHandler(null)
      mediaSession.setPermissionRequestHandler((_c, _p, callback) => callback(false))
      if (entry.window === window) entry.window = undefined
    })
    window.on('move', () => { if (!window.isDestroyed()) entry.bounds = window.getBounds() })
    window.on('resize', () => { if (!window.isDestroyed()) entry.bounds = window.getBounds() })
    contents.on('render-process-gone', () => this.destroy(entry))
    try {
      await window.loadURL(receiverUrl)
      if (valid()) window.showInactive()
      else if (entry.window === window) this.destroy(entry)
    } catch (error) { if (entry.window === window) this.destroy(entry); if (!lifetime.signal.aborted) throw error }
  }
  private destroy(entry: Entry): void {
    entry.lifetime?.abort()
    const window = entry.window
    entry.window = undefined
    if (window && !window.isDestroyed()) {
      entry.bounds = window.getBounds()
      window.destroy()
    }
    if (entry.channel) ipcMain.removeHandler(entry.channel)
  }
  dispose(): void {
    this.disposed = true
    this.suspend()
    this.entries.clear()
  }
}
