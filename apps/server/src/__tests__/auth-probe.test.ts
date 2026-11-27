import { after, before, describe, it } from "node:test"
import assert from "node:assert"
import net from "node:net"
import { InfoOptions } from "@valkey/valkey-glide"
import { openAuthProbe } from "../auth-probe"
import { isAuthError } from "../auth-limiter"

/**
 * The AUTH probe against a minimal RESP server. The server accepts the
 * password "right" for user "alice" or for the default user, and counts
 * connections, so a test can check that a rejected probe does not reconnect.
 */
type FakeServer = { port: number; connections: () => number; commands: string[][]; close: () => Promise<void> }

const startFakeServer = (): Promise<FakeServer> => new Promise((resolve) => {
  let connections = 0
  const commands: string[][] = []
  const sockets = new Set<net.Socket>()
  const server = net.createServer((socket) => {
    connections++
    sockets.add(socket)
    socket.on("close", () => sockets.delete(socket))
    let authed = false
    let buffer = ""
    socket.on("data", (chunk) => {
      buffer += chunk.toString()
      // Commands arrive as RESP arrays of bulk strings.
      for (;;) {
        const match = /^\*(\d+)\r\n/.exec(buffer)
        if (!match) return
        let pos = match[0].length
        const args: string[] = []
        for (let i = 0; i < Number(match[1]); i++) {
          const len = /^\$(\d+)\r\n/.exec(buffer.slice(pos))
          if (!len || buffer.length < pos + len[0].length + Number(len[1]) + 2) return
          pos += len[0].length
          args.push(buffer.slice(pos, pos + Number(len[1])))
          pos += Number(len[1]) + 2
        }
        buffer = buffer.slice(pos)
        commands.push(args)
        const [cmd, ...rest] = args
        if (cmd.toUpperCase() === "AUTH") {
          const [user, pass] = rest.length === 2 ? rest : ["default", rest[0]]
          authed = pass === "right" && (user === "alice" || user === "default")
          socket.write(authed ? "+OK\r\n" : "-WRONGPASS invalid username-password pair or user is disabled.\r\n")
        } else if (!authed) {
          socket.write("-NOAUTH Authentication required.\r\n")
        } else if (cmd.toUpperCase() === "INFO") {
          const body = "# Cluster\r\ncluster_enabled:0\r\n"
          socket.write(`$${body.length}\r\n${body}\r\n`)
        } else {
          socket.write("+PONG\r\n")
        }
      }
    })
  })
  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address() as net.AddressInfo
    resolve({
      port,
      connections: () => connections,
      commands,
      close: () => new Promise((r) => {
        for (const socket of sockets) socket.destroy()
        server.close(() => r())
      }),
    })
  })
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe("openAuthProbe", () => {
  let server: FakeServer
  const options = (credentials?: { username?: string; password: string }) =>
    ({ host: "127.0.0.1", port: server.port, credentials, useTLS: false, verifyTlsCertificate: false })

  before(async () => { server = await startFakeServer() })
  after(async () => { await server.close() })

  it("authenticates and runs commands as the probed user", async () => {
    const probe = await openAuthProbe(options({ username: "alice", password: "right" }))
    try {
      assert.match(await probe.info([InfoOptions.Cluster]), /cluster_enabled:0/)
    } finally {
      probe.close()
    }
    assert.deepStrictEqual(server.commands.find((c) => c[0] === "AUTH"), ["AUTH", "alice", "right"])
  })

  it("sends AUTH with only the password when there is no username", async () => {
    server.commands.length = 0
    const probe = await openAuthProbe(options({ password: "right" }))
    probe.close()
    assert.deepStrictEqual(server.commands[0], ["AUTH", "right"])
  })

  it("rejects a wrong password with WRONGPASS, which the failed-AUTH limit counts", async () => {
    await assert.rejects(openAuthProbe(options({ username: "alice", password: "wrong" })), (err) => {
      assert.match((err as Error).message, /^WRONGPASS/)
      assert.strictEqual(isAuthError(err), true)
      return true
    })
  })

  it("rejects with NOAUTH when no credentials are sent to a node that needs them", async () => {
    await assert.rejects(openAuthProbe(options()), (err) => isAuthError(err) && /NOAUTH/.test((err as Error).message))
  })

  it("opens no further connection after Valkey rejects the credentials", async () => {
    const before = server.connections()
    await Promise.allSettled(Array.from({ length: 20 }, () => openAuthProbe(options({ username: "alice", password: "wrong" }))))
    assert.strictEqual(server.connections() - before, 20, "one connection per probe")
    await sleep(500)
    assert.strictEqual(server.connections() - before, 20, "no reconnect after the rejection")
  })

  it("reports the socket error, not a generic message, when the node cannot be reached", async () => {
    const closed = net.createServer()
    const port = await new Promise<number>((r) => closed.listen(0, "127.0.0.1", () => r((closed.address() as net.AddressInfo).port)))
    await new Promise((r) => closed.close(r))
    await assert.rejects(openAuthProbe({ ...options({ password: "right" }), port }), (err) => {
      assert.strictEqual((err as NodeJS.ErrnoException).code, "ECONNREFUSED")
      assert.strictEqual(isAuthError(err), false)
      return true
    })
  })

  it("refuses a CA path that is not a regular file before it connects", async () => {
    const before = server.connections()
    await assert.rejects(
      openAuthProbe({ ...options({ password: "right" }), useTLS: true, verifyTlsCertificate: true, caCertPath: "/" }),
      /not a regular file/,
    )
    assert.strictEqual(server.connections(), before)
  })
})
