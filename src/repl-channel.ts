/** Bounded transport over DSH's inherited control descriptor. */
import type { Duplex } from 'node:stream'
export const MAX_FRAME = 4 * 1024 * 1024
export class ReplChannel {
  private buffered = Buffer.alloc(0)
  private closed = false
  constructor(private stream: Duplex, receive: (value: unknown) => void, private fail: (error: Error) => void) {
    stream.on('data', (part: Buffer) => {
      if (this.closed) return
      this.buffered = Buffer.concat([this.buffered, part])
      try {
        while (this.buffered.length >= 4) {
          const size = this.buffered.readUInt32BE()
          if (size > MAX_FRAME) throw new Error('REPL control frame exceeds 4 MiB')
          if (this.buffered.length < size + 4) return
          const message: unknown = JSON.parse(this.buffered.subarray(4, size + 4).toString('utf8'))
          this.buffered = this.buffered.subarray(size + 4)
          receive(message)
        }
      } catch (error) { this.abort(error instanceof Error ? error : new Error('Invalid REPL frame')) }
    })
    stream.on('error', error => this.abort(error))
    stream.on('close', () => this.abort(new Error('REPL control channel closed')))
  }
  send(value: unknown): void {
    if (this.closed) throw new Error('REPL control channel is closed')
    const body = Buffer.from(JSON.stringify(value))
    if (body.length > MAX_FRAME || this.stream.writableLength > MAX_FRAME) throw new Error('REPL control output exceeds 4 MiB')
    const header = Buffer.alloc(4); header.writeUInt32BE(body.length)
    this.stream.write(Buffer.concat([header, body]))
  }
  private abort(error: Error): void { if (!this.closed) { this.closed = true; this.stream.destroy(); this.fail(error) } }
  close(): void { this.closed = true; this.stream.destroy() }
}
