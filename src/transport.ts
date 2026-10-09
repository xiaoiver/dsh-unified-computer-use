/** Private companion Node IPC. No socket, bearer token, or remote debugging port. */
import { randomUUID } from 'node:crypto'
import { replySchema, type Request, type Result } from './protocol.ts'

export interface IpcPort {
  send(message: object, callback?: (error: Error | null) => void): boolean
  on(event: 'message' | 'disconnect', listener: (...args: unknown[]) => void): unknown
  off(event: 'message' | 'disconnect', listener: (...args: unknown[]) => void): unknown
}

/** One plugin's pending requests; ids remain private to this process. */
export class DesktopTransport {
  private pending = new Map<string, { resolve(value: Result): void; reject(error: Error): void }>()
  private closed = false
  constructor(private port: IpcPort, private timeoutMs: number) {
    port.on('message', this.message)
    port.on('disconnect', this.disconnected)
  }
  private message = (value: unknown): void => {
    const parsed = replySchema.safeParse(value)
    if (!parsed.success) return
    const { id, result, error } = parsed.data
    if (error !== undefined) this.pending.get(id)?.reject(new Error(error))
    else if (result !== undefined) this.pending.get(id)?.resolve(result)
  }
  private disconnected = (): void => { this.close() }

  /** Canceling a request cancels its owner on the parent before more work may start. */
  async call(owner: string, operation: Request['operation'], signal: AbortSignal): Promise<Result> {
    signal.throwIfAborted()
    if (this.closed) throw new Error('Computer Use companion is disconnected')
    const id = randomUUID()
    let timer: ReturnType<typeof setTimeout> | undefined
    const abort = (): void => {
      this.port.send({ type: 'dsh-cua/cancel', version: 1, id }, () => {})
      this.pending.get(id)?.reject(new Error('Computer Use canceled; observe again before retrying'))
    }
    try {
      return await new Promise<Result>((resolve, reject) => {
        this.pending.set(id, { resolve, reject })
        signal.addEventListener('abort', abort, { once: true })
        timer = setTimeout(() => {
          this.port.send({ type: 'dsh-cua/cancel', version: 1, id }, () => {})
          reject(new Error('Desktop bridge timed out; the Computer Use companion did not respond'))
        }, this.timeoutMs)
        this.port.send({ type: 'dsh-cua/request', version: 1, id, owner, operation }, error => { if (error) reject(error) })
      })
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      this.pending.delete(id)
    }
  }
  close(): void {
    if (this.closed) return
    this.closed = true
    this.port.off('message', this.message)
    this.port.off('disconnect', this.disconnected)
    for (const request of this.pending.values()) request.reject(new Error('Desktop bridge disconnected'))
    this.pending.clear()
  }
}
