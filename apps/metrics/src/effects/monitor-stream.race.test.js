import net from "node:net"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mockEnv } from "../__tests__/test-helpers.js"
import { connectMonitor, collectLogs } from "./monitor-stream.js"

/*
 * Runs the real iovalkey client against a fake RESP server, so the MONITOR
 * start race happens on every run instead of depending on traffic timing.
 *
 * iovalkey only switches a connection to monitoring mode in a `.then()` after
 * MONITOR's OK. When the OK and the first monitor lines land in one socket
 * read, the parser handles those lines before that runs, finds no queued
 * command for them, and emits "Command queue state error" for each one. If the
 * connection has no error listener at that point, the error is thrown from the
 * socket handler and the collector process exits.
 */

const monitorLine = (key) => `+1700000000.000001 [0 127.0.0.1:5555] "GET" "${key}"\r\n`
const bulk = (s) => `$${Buffer.byteLength(s)}\r\n${s}\r\n`

const LATER_LINES = 3

/**
 * mode "race":        OK and two monitor lines in one write, then LATER_LINES more, 20ms apart
 * mode "unsupported": MONITOR answered with an unknown-command error
 */
const startFakeServer = (mode) => new Promise((resolve) => {
  const sockets = new Set()
  const server = net.createServer((sock) => {
    sockets.add(sock)
    sock.on("close", () => sockets.delete(sock))
    sock.on("error", () => {})
    sock.on("data", (buf) => {
      const req = buf.toString().toLowerCase()
      // iovalkey's ready check
      if (req.includes("info")) sock.write(bulk("# Persistence\r\nloading:0\r\n"))
      if (!req.includes("monitor")) return

      if (mode === "unsupported") {
        sock.write("-ERR unknown command 'monitor', with args beginning with: \r\n")
        return
      }
      sock.write("+OK\r\n" + monitorLine("race:1") + monitorLine("race:2"))
      let sent = 0
      const interval = setInterval(() => {
        if (sock.destroyed || sent >= LATER_LINES) return clearInterval(interval)
        sock.write(monitorLine(`later:${++sent}`))
      }, 20)
    })
  })
  server.listen(0, "127.0.0.1", () => resolve({
    port: server.address().port,
    close: () => new Promise((done) => {
      sockets.forEach((s) => s.destroy())
      server.close(done)
    }),
  }))
})

describe("connectMonitor against a real iovalkey connection", () => {
  let cleanupEnv
  let fake

  const useFakeServer = async (mode) => {
    fake = await startFakeServer(mode)
    cleanupEnv = mockEnv({ VALKEY_HOST: "127.0.0.1", VALKEY_PORT: String(fake.port) })
    return fake.port
  }

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "debug").mockImplementation(() => {})
  })

  afterEach(async () => {
    cleanupEnv?.()
    cleanupEnv = undefined
    await fake?.close()
    fake = undefined
    vi.restoreAllMocks()
  })

  it("survives monitor lines that arrive in the same read as MONITOR's OK", async () => {
    await useFakeServer("race")

    const handle = await connectMonitor()
    expect(handle.monitor.status).toBe("monitoring")

    // Lines sent after the race are collected. The two caught in the race are
    // dropped with today's iovalkey; the count isn't asserted so the test keeps
    // passing if iovalkey fixes the race and delivers them.
    const rows = await collectLogs(handle, { monitoringDuration: 2000, maxCommandsPerRun: LATER_LINES })
    expect(rows.map((r) => r.command)).toEqual(expect.arrayContaining(["GET later:1", "GET later:2", "GET later:3"]))
  })

  it("rejects when the server does not support MONITOR", async () => {
    await useFakeServer("unsupported")

    // makeMonitorStream stops retrying when the message contains "unknown command".
    await expect(connectMonitor()).rejects.toThrow(/unknown command/)
  })

  it("rejects instead of retrying when the connection is refused", async () => {
    const port = await useFakeServer("race")
    await fake.close()
    fake = undefined
    expect(port).toBeGreaterThan(0)

    await expect(connectMonitor()).rejects.toThrow(/ECONNREFUSED/)
  })
})
