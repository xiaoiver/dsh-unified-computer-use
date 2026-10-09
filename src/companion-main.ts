/** Standalone Electron entry. Only the spawning plugin owns the inherited IPC channel. */
import { app } from 'electron'
import { createDesktopBridge, type DesktopBridge } from './desktop.ts'
import { isAbsolute } from 'node:path'

const profile = process.argv[2]
if (!process.send || !process.connected || !profile || !isAbsolute(profile)) throw new Error('Launch this companion through the DSH plugin')
app.setName('DSH Computer Use')
app.setPath('userData', profile)
app.on('window-all-closed', () => {})
let bridge: DesktopBridge | undefined
let closing: Promise<void> | undefined
const send = (message: object) => { if (process.connected) process.send?.(message, () => {}) }
function shutdown(): Promise<void> {
  return closing ??= (async () => {
    const deadline = setTimeout(() => app.exit(1), 7000)
    try { await bridge?.dispose(); send({ type: 'dsh-cua/stopped', version: 1 }) }
    finally { clearTimeout(deadline); app.exit(0) }
  })()
}
process.on('disconnect', () => { void shutdown() })
process.on('SIGTERM', () => { void shutdown() })
process.on('message', (message: unknown) => {
  if (message && typeof message === 'object' && 'type' in message && message.type === 'dsh-cua/shutdown') { void shutdown(); return }
  bridge?.handle(message)
})
app.on('before-quit', event => { if (!closing) { event.preventDefault(); void shutdown() } })
void app.whenReady().then(() => {
  if (closing || !process.connected) return shutdown()
  bridge = createDesktopBridge({ hostUrl: () => undefined, send })
  send({ type: 'dsh-cua/ready', version: 1, electron: process.versions.electron })
}).catch(error => { send({ type: 'dsh-cua/fatal', message: String(error) }); app.exit(1) })
