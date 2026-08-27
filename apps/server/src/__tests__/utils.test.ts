/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, beforeEach } from "node:test"
import assert from "node:assert"
import { GlideClusterClient } from "@valkey/valkey-glide"
import { parseInfo, parseResponse, parseClusterInfo, getExistingClusterClient } from "../utils"
import { ensureSession, authorizeConnection, _resetSessions } from "../session"
import type { IncomingMessage } from "http"

describe("getExistingClusterClient (session-scoped reuse)", () => {
  let sessionId: string
  const makeClusterEntry = () => ({
    // Satisfies isClusterClientEntry's `instanceof GlideClusterClient` check without a real client.
    client: Object.create(GlideClusterClient.prototype) as GlideClusterClient,
    clusterId: "cluster-1",
  })

  beforeEach(() => {
    _resetSessions()
    sessionId = ensureSession({ headers: {}, socket: {} } as unknown as IncomingMessage).sessionId
  })

  it("reuses the shared cluster client when the session owns the matched sibling node", async () => {
    const entry = makeClusterEntry()
    const clients = new Map([["node-A", entry]])
    // Session connected to node-A earlier -> owns it.
    authorizeConnection(sessionId, "node-A")

    // Connecting to node-B of the same cluster: discovery surfaces node-A as an existing entry.
    const discovered = { "node-A": {} as never, "node-B": {} as never }
    const result = await getExistingClusterClient(discovered, clients, sessionId)

    assert.strictEqual(result?.client, entry.client, "should reuse the owned cluster's client for the new node")
  })

  it("does NOT reuse when the session does not own the matched node", async () => {
    const entry = makeClusterEntry()
    const clients = new Map([["node-A", entry]])
    // node-A belongs to a DIFFERENT session.
    const otherSession = ensureSession({ headers: {}, socket: {} } as unknown as IncomingMessage).sessionId
    authorizeConnection(otherSession, "node-A")

    const discovered = { "node-A": {} as never }
    const result = await getExistingClusterClient(discovered, clients, sessionId)

    assert.strictEqual(result, undefined, "must not inherit another session's cluster client")
  })
})

describe("parseInfo", () => {
  it("should parse INFO response string into key-value pairs", () => {
    const infoStr = `# Server
valkey_version:8.0.0
valkey_mode:standalone
os:Linux 5.15.0

# Clients
connected_clients:2
blocked_clients:0`

    const result = parseInfo(infoStr)

    assert.deepStrictEqual(result, {
      valkey_version: "8.0.0",
      valkey_mode: "standalone",
      os: "Linux 5.15.0",
      connected_clients: "2",
      blocked_clients: "0",
    })
  })

  it("should skip lines without colons", () => {
    const infoStr = `# Server
valkey_version:8.0.0
invalid line without colon
valkey_mode:standalone`

    const result = parseInfo(infoStr)

    assert.deepStrictEqual(result, {
      valkey_version: "8.0.0",
      valkey_mode: "standalone",
    })
  })

  it("should skip comment lines starting with #", () => {
    const infoStr = `# Server
# This is a comment
valkey_version:8.0.0`

    const result = parseInfo(infoStr)

    assert.deepStrictEqual(result, {
      valkey_version: "8.0.0",
    })
  })

  it("should handle empty strings", () => {
    const result = parseInfo("")
    assert.deepStrictEqual(result, {})
  })

  it("should trim whitespace from keys and values", () => {
    const infoStr = `  valkey_version  :  8.0.0
  valkey_mode  :  standalone  `

    const result = parseInfo(infoStr)

    assert.deepStrictEqual(result, {
      valkey_version: "8.0.0",
      valkey_mode: "standalone",
    })
  })

  it("should handle values with colons by splitting only on first colon", () => {
    const infoStr = "url:http://localhost:6379\r\ntime:12:30"

    const result = parseInfo(infoStr)

    assert.deepStrictEqual(result, {
      url: "http://localhost:6379",
      time: "12:30",
    })
  })
})

describe("parseResponse", () => {
  it("should parse string responses containing colons", () => {
    const response = "valkey_version:8.0.0\nvalkey_mode:standalone"
    const result = parseResponse(response)

    assert.deepStrictEqual(result, {
      valkey_version: "8.0.0",
      valkey_mode: "standalone",
    })
  })

  it("should return original response if no colon present", () => {
    const response = "OK"
    const result = parseResponse(response)

    assert.strictEqual(result, "OK")
  })

  it("should handle non-string responses", () => {
    const response = 123
    const result = parseResponse(response as any)

    assert.strictEqual(result, 123)
  })

  it("should parse fanout responses", () => {
    const response = [
      { key: "localhost:7001", value: "valkey_version:8.0.0\nvalkey_mode:cluster" },
      { key: "localhost:7002", value: "# CPU\nused_cpu_sys:0.1" },
    ]

    const result = parseResponse(response as any)

    assert.deepStrictEqual(result, [
      {
        key: "localhost:7001",
        value: { valkey_version: "8.0.0", valkey_mode: "cluster" },
      },
      {
        key: "localhost:7002",
        value: { used_cpu_sys: "0.1" },
      },
    ])
  })

  it("should return non-fanout arrays unchanged", () => {
    const response = ["key1", "key2"]
    const result = parseResponse(response as any)

    assert.deepStrictEqual(result, ["key1", "key2"])
  })
})

describe("parseClusterInfo", () => {
  it("should parse cluster info response from single host", () => {
    const rawInfo = {
      "192.168.1.1:6379": `# Server\r
valkey_version:8.0.0\r
valkey_mode:cluster\r
\r
# Memory\r
used_memory:1024000`,
    }

    const result = parseClusterInfo(rawInfo)

    const keys = Object.keys(result)
    assert.strictEqual(keys.length, 1)
    const key = keys[0]
    assert.ok(result[key].Server)
    assert.strictEqual(result[key].Server.valkey_version, "8.0.0")
    assert.strictEqual(result[key].Server.valkey_mode, "cluster")
    assert.ok(result[key].Memory)
    assert.strictEqual(result[key].Memory.used_memory, "1024000")
  })

  it("should sanitize host keys", () => {
    const rawInfo = {
      "http://localhost:6379": `# Server\r
valkey_version:8.0.0`,
    }

    const result = parseClusterInfo(rawInfo)

    const keys = Object.keys(result)
    assert.strictEqual(keys.length, 1)
    assert.ok(keys[0].includes("localhost"))
  })

  it("should throw error for invalid input", () => {
    assert.throws(
      () => parseClusterInfo(null as any),
      /Invalid ClusterResponse: expected an object with host keys./,
    )
    assert.throws(() => parseClusterInfo("invalid" as any))
    assert.throws(() => parseClusterInfo(123 as any))
  })
})

