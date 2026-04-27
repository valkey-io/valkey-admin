import WebSocket from "ws"

export type InboundMessage = {
  type: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meta?: any
}

export class WsClient {
  private socket: WebSocket
  private buffer: InboundMessage[] = []
  private waiters: Array<{
    type: string
    resolve: (msg: InboundMessage) => void
    reject: (err: Error) => void
    timer: NodeJS.Timeout
  }> = []
  private closed = false

  private constructor(socket: WebSocket) {
    this.socket = socket
    socket.on("message", (data) => this.onMessage(data))
    socket.on("close", () => this.onClose())
    socket.on("error", (err) => this.onError(err))
  }

  static connect(url: string, timeoutMs = 10000): Promise<WsClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url)
      const timer = setTimeout(() => {
        socket.terminate()
        reject(new Error(`WS connect timed out after ${timeoutMs}ms: ${url}`))
      }, timeoutMs)

      socket.once("open", () => {
        clearTimeout(timer)
        resolve(new WsClient(socket))
      })
      socket.once("error", (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send(action: { type: string; payload?: any; meta?: any }): void {
    if (this.closed) throw new Error("WsClient is closed")
    this.socket.send(JSON.stringify(action))
  }

  /**
   * Returns the next inbound message of the given `type`.
   * Matches against already-buffered messages first; then waits.
   */
  waitFor(type: string, timeoutMs = 10000): Promise<InboundMessage> {
    // Check buffer first
    const idx = this.buffer.findIndex((m) => m.type === type)
    if (idx !== -1) {
      const [msg] = this.buffer.splice(idx, 1)
      return Promise.resolve(msg)
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.waiters.findIndex((w) => w.resolve === resolve)
        if (i !== -1) this.waiters.splice(i, 1)
        reject(new Error(`Timed out waiting for ${type} after ${timeoutMs}ms`))
      }, timeoutMs)

      this.waiters.push({ type, resolve, reject, timer })
    })
  }

  /**
   * Collect every inbound message of the given `type` that arrives within
   * `windowMs`. Returns whatever has accumulated when the window closes.
   *
   * Useful for fan-out scenarios where the response count is non-deterministic
   * (e.g., cluster-wide broadcasts filtered by server-side registry state).
   * Hitting the deadline is the expected exit condition and is NOT surfaced
   * as an error. Any other rejection from the underlying `waitFor` (socket
   * close, ws error) still propagates.
   */
  async collectFor(
    type: string,
    windowMs = 5000,
  ): Promise<InboundMessage[]> {
    const deadline = Date.now() + windowMs
    const results: InboundMessage[] = []
    while (Date.now() < deadline) {
      if (this.closed) break
      const remaining = deadline - Date.now()
      if (remaining <= 0) break
      try {
        results.push(await this.waitFor(type, remaining))
      } catch (err) {
        // Deadline expiry ends collection; other errors propagate.
        if ((err as Error).message.startsWith("Timed out waiting")) break
        throw err
      }
    }
    return results
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    for (const w of this.waiters) {
      clearTimeout(w.timer)
      w.reject(new Error("WsClient closed before message arrived"))
    }
    this.waiters = []

    await new Promise<void>((resolve) => {
      if (this.socket.readyState === WebSocket.CLOSED) return resolve()
      this.socket.once("close", () => resolve())
      this.socket.close()
    })
  }

  private onMessage(data: WebSocket.RawData): void {
    let msg: InboundMessage
    try {
      msg = JSON.parse(data.toString())
    } catch {
      return
    }

    // Deliver to first matching waiter, else buffer
    const i = this.waiters.findIndex((w) => w.type === msg.type)
    if (i !== -1) {
      const [w] = this.waiters.splice(i, 1)
      clearTimeout(w.timer)
      w.resolve(msg)
      return
    }
    this.buffer.push(msg)
  }

  private onClose(): void {
    this.closed = true
    for (const w of this.waiters) {
      clearTimeout(w.timer)
      w.reject(new Error("WsClient socket closed before message arrived"))
    }
    this.waiters = []
  }

  private onError(err: Error): void {
    for (const w of this.waiters) {
      clearTimeout(w.timer)
      w.reject(err)
    }
    this.waiters = []
  }
}
