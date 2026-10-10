/** Exact-window PiP owned by one Agent. The model cannot choose binaries or IPC routes. */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import manifest from '../native/manifest.json' with { type: 'json' }

export interface PreviewTarget { id: string; pid: number; windowId: number; title: string }
export interface PreviewPort {
  activate(target: PreviewTarget): void
  close(target: string): void
}
interface PipCommand { action: 'open' | 'close' | 'resume' | 'finish' | 'shutdown'; target?: string; pid?: number; windowId?: number; title?: string; slot?: number }
export interface PipTransport { send(command: PipCommand): void; close(): Promise<void> }
type Notice = (event: string, message?: string, target?: string) => void
export async function createPipTransport(notice: Notice): Promise<PipTransport> {
  const binary = fileURLToPath(new URL('../native/bin/dsh-native-pip', import.meta.url))
  const bytes = await readFile(binary)
  if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) throw new Error('Native PiP helper checksum mismatch. Reinstall the plugin bundle.')
  await chmod(binary, 0o700)
  const child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: '/usr/bin:/bin', LANG: process.env.LANG ?? 'en_US.UTF-8' } })
  const ready = Promise.withResolvers<void>(), exited = Promise.withResolvers<void>()
  let closing: Promise<void> | undefined, ended = false, stderr = ''
  const lines = createInterface({ input: child.stdout })
  const timer = setTimeout(() => ready.reject(new Error('Native PiP helper startup timed out')), 5000)
  child.stderr.on('data', data => { stderr = (stderr + String(data)).slice(-2000) })
  child.stdin.on('error', error => { if (!ended) notice('error', error.message) })
  child.on('error', error => ready.reject(error))
  child.once('close', code => {
    ended = true; clearTimeout(timer); lines.close(); exited.resolve()
    ready.reject(new Error(`Native PiP helper exited (${code}): ${stderr}`))
    notice('exit')
  })
  lines.on('line', line => {
    if (line.length > 16384) return
    try {
      const value = JSON.parse(line) as Record<string, unknown>
      if (value.event === 'ready') ready.resolve()
      else if (typeof value.event === 'string') notice(value.event, typeof value.message === 'string' ? value.message : undefined, typeof value.target === 'string' ? value.target : undefined)
    } catch { /* Only parse the helper's bounded JSON status, never executable data. */ }
  })
  const send = (command: PipCommand) => {
    if (ended || child.stdin.destroyed) return
    child.stdin.write(JSON.stringify(command) + '\n')
  }
  const close = () => closing ??= (async () => {
    if (ended) return
    send({ action: 'shutdown' }); child.stdin.end()
    const terminate = setTimeout(() => child.kill('SIGTERM'), 1500)
    const kill = setTimeout(() => child.kill('SIGKILL'), 3000)
    try { await exited.promise } finally { clearTimeout(terminate); clearTimeout(kill) }
  })()
  try { await ready.promise; return { send, close } }
  catch (error) { await close(); throw error }
  finally { clearTimeout(timer) }
}

// Slots span Agents in this Host, while target identities and pipes remain owner-local.
const slots = new Set<number>()
function reserveSlot(): number { let slot = 0; while (slots.has(slot)) slot++; slots.add(slot); return slot }
interface Entry { target: PreviewTarget; slot: number; revision: number; dismissed: boolean }
export class NativePip implements PreviewPort {
  private pending?: Promise<PipTransport>
  private transport?: PipTransport
  private entries = new Map<string, Entry>()
  private epoch = 0
  private closed = false
  private finishing = false
  private disposing?: Promise<void>
  constructor(private warn: (message: string) => void,
    private available = process.platform === 'darwin',
    private factory = createPipTransport) {}
  activate(target: PreviewTarget): void {
    if (!this.available || this.closed || this.finishing) return
    if (!target.id || target.id.length > 128 || !Number.isInteger(target.pid) || target.pid <= 0 || target.pid > 0x7fff_ffff || !Number.isInteger(target.windowId) || target.windowId <= 0 || target.windowId > 0xffff_ffff) return
    let entry = this.entries.get(target.id)
    if (!entry) {
      entry = { target, slot: reserveSlot(), revision: 0, dismissed: false }
      this.entries.set(target.id, entry)
    }
    if (entry.dismissed) return
    entry.target = { ...target, title: target.title.slice(0, 120) }
    const revision = ++entry.revision, epoch = this.epoch, selected = entry
    this.pending ??= this.factory((event, message, id) => {
      if (event === 'dismissed' && id) { const item = this.entries.get(id); if (item) item.dismissed = true }
      if (event === 'error') this.warn(`Native PiP: ${message ?? 'preview unavailable'}`)
      if (event === 'exit') { this.transport = undefined; this.pending = undefined }
    }).then(transport => { this.transport = transport; return transport })
    const pending = this.pending
    void pending.then(transport => {
      if (this.closed || this.epoch !== epoch || this.entries.get(target.id) !== selected || revision !== selected.revision || selected.dismissed || this.finishing) return
      const value = selected.target
      transport.send({ action: 'open', target: value.id, pid: value.pid, windowId: value.windowId, title: value.title, slot: selected.slot })
    }).catch(error => {
      if (this.pending === pending) this.pending = undefined
      if (!this.closed) this.warn(`Native PiP: ${error instanceof Error ? error.message : String(error)}`)
    })
  }
  resume(): void {
    this.finishing = false
    for (const entry of this.entries.values()) entry.dismissed = false
    this.transport?.send({ action: 'resume' })
  }
  finish(): void { this.finishing = true; ++this.epoch; this.transport?.send({ action: 'finish' }) }
  close(target: string): void {
    const entry = this.entries.get(target)
    if (!entry) return
    this.entries.delete(target)
    this.transport?.send({ action: 'close', target })
    slots.delete(entry.slot)
  }
  dispose(): Promise<void> {
    if (this.disposing) return this.disposing
    this.closed = true; ++this.epoch
    const pending = this.pending
    this.disposing = (async () => {
      try { const transport = await pending?.catch(() => undefined); await transport?.close() }
      finally { for (const entry of this.entries.values()) slots.delete(entry.slot); this.entries.clear() }
    })()
    return this.disposing
  }
}
