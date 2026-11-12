import { after, before, describe, it } from "node:test"
import assert from "node:assert"
import { createServer } from "node:net"
import { VALKEY, buildConnectionId } from "valkey-common"
import { type WebSocket, WebSocketServer } from "ws"
import { createAdminClient } from "../admin-client"
import type { IncomingMessage } from "node:http"

const valkey = { host: "valkey-prod", port: 6379, username: "mcp_readonly", password: "secret", useTLS: false }

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })

describe("createAdminClient", () => {
  let wss: WebSocketServer
  let url: string
  const upgrades: IncomingMessage[] = []
  const received: { type: string; payload?: Record<string, unknown> }[] = []

  before(async () => {
    wss = new WebSocketServer({ port: 0, host: "127.0.0.1" })
    await new Promise((resolve) => wss.once("listening", resolve))
    url = `ws://127.0.0.1:${(wss.address() as { port: number }).port}`
    wss.on("connection", (ws: WebSocket, req) => {
      upgrades.push(req)
      ws.on("message", (data) => {
        const action = JSON.parse(data.toString())
        received.push(action)
        ws.send(JSON.stringify({
          type: VALKEY.CONNECTION.connectRejected,
          payload: { connectionId: action.payload.connectionId, errorMessage: "WRONGPASS from test" },
        }))
      })
    })
  })

  after(() => {
    wss.clients.forEach((client) => client.terminate())
    wss.close()
  })

  it("refuses actions outside the read-only allowlist without opening a websocket", async () => {
    const client = createAdminClient(valkey, { url, origin: "valkey-admin-mcp://localhost" })

    for (const type of [VALKEY.COMMAND.sendRequested, VALKEY.CONNECTION.connectPending, "anything"]) {
      await assert.rejects(client.request({ type }, []), /not on the read-only allowlist/)
    }
    assert.strictEqual(upgrades.length, 0)
  })

  it("connects with the MCP origin and token, sends the Valkey credentials and reports a rejection", async () => {
    const client = createAdminClient(valkey, { url, origin: "valkey-admin-mcp://localhost", token: "internal-token" })

    await assert.rejects(client.request({ type: VALKEY.STATS.setData }, []), /WRONGPASS from test/)

    const upgrade = upgrades.at(-1)
    assert.strictEqual(upgrade?.headers.origin, "valkey-admin-mcp://localhost")
    assert.strictEqual(new URL(upgrade?.url ?? "", "http://x").searchParams.get("token"), "internal-token")

    const connect = received.at(-1)
    assert.strictEqual(connect?.type, VALKEY.CONNECTION.connectPending)
    assert.strictEqual(connect?.payload?.connectionId, buildConnectionId(valkey.host, valkey.port))
    const details = connect?.payload?.connectionDetails as Record<string, unknown>
    assert.strictEqual(details.host, "valkey-prod")
    assert.strictEqual(details.username, "mcp_readonly")
    assert.strictEqual(details.password, "secret")
    client.close()
  })

  it("does not put the token in the error when Valkey Admin is unreachable", async () => {
    const port = await freePort()
    const client = createAdminClient(valkey, {
      url: `ws://127.0.0.1:${port}`,
      origin: "valkey-admin-mcp://localhost",
      token: "internal-token",
    })

    await assert.rejects(
      client.request({ type: VALKEY.STATS.setData }, []),
      (error: Error) => /Cannot reach Valkey Admin/.test(error.message) && !error.message.includes("internal-token"),
    )
  })
})
