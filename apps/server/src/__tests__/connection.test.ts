/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, mock, beforeEach } from "node:test"
import assert from "node:assert"
import { GlideClient, GlideClusterClient } from "@valkey/valkey-glide"
import { sanitizeUrl } from "common/src/url-utils.ts"
import { connectToValkey, returnIfDuplicateConnection } from "../connection.ts"
import { resolveHostnameOrIpAddress, dns } from "../utils.ts"
import { checkJsonModuleAvailability } from "../check-json-module.ts"
import { KEY_EVICTION_POLICY, VALKEY } from "../../../../common/src/constants.ts"
import { ConnectionDetails } from "../actions/connection.ts"

const DEFAULT_PAYLOAD = {
  connectionDetails: {
    host: "127.0.0.1",
    port: "6379",
    username: "user0",
    password: "helloWorld123!",
    tls: false,
    verifyTlsCertificate: false,
  } as ConnectionDetails,
  connectionId: "",
}

describe("connectToValkey", () => {
  let mockWs: any
  let messages: string[]
  let clients: Map<string, any>

  beforeEach(() => {
    messages = []
    mockWs = {
      send: mock.fn((msg: string) => messages.push(msg)),
    }
    clients = new Map()
  })

  async function runClusterConnectionTest(payloadOverrides: Partial<any> = {}) {
    const mockStandaloneClient = {
      info: mock.fn(async () => "cluster_enabled:1"),
      customCommand: mock.fn(async (args: string[]) => {
        if (args[0] === "MODULE" && args[1] === "LIST") {
          return [[{ key: "name", value: "rejson" }]]
        }

        if (
          args[0] === "CONFIG" &&
        args[1] === "GET" &&
        args[2] === "maxmemory-policy"
        ) {
          return [{ key: "maxmemory-policy", value: "allkeys-lfu" }]
        }

        if (args[0] === "CLUSTER" && args[1] === "SLOTS") {
          return [
            [
              0,
              5460,
              ["192.168.1.1", 6379, "node-1"],
              ["192.168.1.2", 6379, "replica-1"],
            ],
          ]
        }

        if (args[0] === "CONFIG" && args[1] === "SET") {
          return "OK"
        }

        return [{ key: "", value: "" }]
      }),
      close: mock.fn(),
    }

    const mockClusterClient = {
      customCommand: mock.fn(async () => [{ key: "", value: "" }]),
      close: mock.fn(),
    }

    const originalCreateClient = GlideClient.createClient
    const originalCreateClusterClient = GlideClusterClient.createClient

    GlideClient.createClient = mock.fn(async () => mockStandaloneClient as any)
    GlideClusterClient.createClient = mock.fn(async () => mockClusterClient as any)

    const payload = {
      ...DEFAULT_PAYLOAD,
      ...payloadOverrides, 
    }

    try {
      const result = await connectToValkey(mockWs, payload, clients)

      assert.ok(result)
      assert.strictEqual(mockStandaloneClient.close.mock.calls.length, 1)
      assert.strictEqual(clients.get(payload.connectionId), mockClusterClient)

      const parsedMessages = messages.map((msg) => JSON.parse(msg))

      const clusterMessage = parsedMessages.find(
        (msg) => msg.type === VALKEY.CLUSTER.addCluster,
      )
      assert.ok(clusterMessage)

      const fulfilled = parsedMessages.find(
        (msg) => msg.type === VALKEY.CONNECTION.clusterConnectFulfilled,
      )
      assert.ok(fulfilled)
      assert.strictEqual(fulfilled.payload.connectionId, payload.connectionId)
    } finally {
      GlideClient.createClient = originalCreateClient
      GlideClusterClient.createClient = originalCreateClusterClient
    }
  }

  async function runStandaloneConnectionTest(
    payloadOverrides: Partial<any> = {},
  ) {
    const mockStandaloneClient = {
      info: mock.fn(async () => "cluster_enabled:0"),
      customCommand: mock.fn(async (args: string[]) => {
        if (
          Array.isArray(args) &&
          args[0] === "CONFIG" &&
          args[1] === "GET" &&
          args[2] === "maxmemory-policy"
        ) {
          return [{ key: "maxmemory-policy", value: "allkeys-lfu" }]
        }

        // default response for other commands
        return []
      }),
      close: mock.fn(),
    }

    const originalCreateClient = GlideClient.createClient
    GlideClient.createClient = mock.fn(async () => mockStandaloneClient as any)

    const payload = {
      ...DEFAULT_PAYLOAD,
      ...payloadOverrides,
    }

    try {
      const result = await connectToValkey(mockWs, payload, clients)

      assert.ok(result)
      assert.strictEqual(clients.get(payload.connectionId), mockStandaloneClient)
      assert.strictEqual(mockWs.send.mock.calls.length, 1)

      const sentMessage = JSON.parse(messages[0])
      assert.strictEqual(
        sentMessage.type,
        VALKEY.CONNECTION.standaloneConnectFulfilled,
      )
      assert.strictEqual(sentMessage.payload.connectionId, payload.connectionId)
      const expectedDetails: any = {
        host: payload.connectionDetails.host,
        port: payload.connectionDetails.port,
        keyEvictionPolicy: KEY_EVICTION_POLICY.ALLKEYS_LFU,
        jsonModuleAvailable: false,
        tls: false, 
        verifyTlsCertificate: false,
      }

      expectedDetails.username = payload.connectionDetails.username
      expectedDetails.password = payload.connectionDetails.password

      assert.deepStrictEqual(
        sentMessage.payload.connectionDetails,
        expectedDetails,
      )
    } finally {
      GlideClient.createClient = originalCreateClient
    }
  }

  it("should connect to standalone Valkey instance", async () => {
    await runStandaloneConnectionTest()
  })

  it("should connect to cluster Valkey instance", async () => {
    await runClusterConnectionTest()
  })

  it("should handle connection errors", async () => {
    const error = new Error("Connection failed")
    const originalCreateClient = GlideClient.createClient
    GlideClient.createClient = mock.fn(async () => {
      throw error
    })

    try {
      const result = await connectToValkey(mockWs, DEFAULT_PAYLOAD, clients)

      assert.strictEqual(result, undefined)
      assert.strictEqual(clients.has(DEFAULT_PAYLOAD.connectionId), false)
      assert.strictEqual(mockWs.send.mock.calls.length, 1)

      const sentMessage = JSON.parse(messages[0])
      assert.strictEqual(sentMessage.type, VALKEY.CONNECTION.connectRejected)
      assert.strictEqual(sentMessage.payload.connectionId, DEFAULT_PAYLOAD.connectionId)
      assert.ok(sentMessage.payload.err)
    } finally {
      GlideClient.createClient = originalCreateClient
    }
  })

  it("should use correct client configuration", async () => {
    const mockStandaloneClient = {
      info: mock.fn(async () => "cluster_enabled:0"),
      customCommand: mock.fn(),
      close: mock.fn(),
    }

    const originalCreateClient = GlideClient.createClient
    GlideClient.createClient = mock.fn(async (config: any) => {
      assert.ok(config)
      assert.deepStrictEqual(config.addresses, [{ host: DEFAULT_PAYLOAD.connectionDetails.host, port: DEFAULT_PAYLOAD.connectionDetails.port }])
      assert.strictEqual(config.requestTimeout, 5000)
      assert.strictEqual(config.clientName, "test_client")
      return mockStandaloneClient as any
    })

    const alternate_payload = {
      connectionDetails: {
        host: "192.168.1.1",
        port: "7000",
        username: "user1",
        password: "helloWorld456!",
        tls: false,
        verifyTlsCertificate: false,
        connectionId: "conn-456",
      } as ConnectionDetails,
      connectionId: "",
    }

    try {
      await connectToValkey(mockWs, alternate_payload, clients)
      assert.strictEqual((GlideClient.createClient as any).mock.calls.length, 1)
    } finally {
      GlideClient.createClient = originalCreateClient
    }
  })

  it("should store client in clients map with correct connectionId", async () => {
    const mockStandaloneClient = {
      info: mock.fn(async () => "cluster_enabled:0"),
      customCommand: mock.fn(),
      close: mock.fn(),
    }

    const originalCreateClient = GlideClient.createClient
    GlideClient.createClient = mock.fn(async () => mockStandaloneClient as any)

    const payload = structuredClone(DEFAULT_PAYLOAD)
    const uniqueConnID = "unique-conn-id"
    payload.connectionId = uniqueConnID

    try {
      await connectToValkey(mockWs, payload, clients)

      assert.strictEqual(clients.size, 1)
      assert.ok(clients.has(uniqueConnID))
      assert.strictEqual(clients.get(uniqueConnID), mockStandaloneClient)
    } finally {
      GlideClient.createClient = originalCreateClient
    }
  })

  it("should detect JSON module availability", async () => {
    const mockClient = {
      customCommand: mock.fn(async () => [
        [{ key: "name", value: "json" }, { key: "ver", value: 10002 }],
      ]),
    }

    const result = await checkJsonModuleAvailability(mockClient as any)
    assert.strictEqual(result, true)
  })

  it("should return false when JSON module is not present", async () => {
    const mockClient = {
      customCommand: mock.fn(async () => [
        [{ key: "name", value: "search" }],
      ]),
    }

    const result = await checkJsonModuleAvailability(mockClient as any)
    assert.strictEqual(result, false)
  })

})
describe("resolveHostnameOrIpAddress", () => {
  beforeEach(() => {
    mock.restoreAll()
  })

  it("resolves an IP address using reverse lookup", async () => {
    mock.method(dns, "reverse", async () => ["example.com"])

    const result = await resolveHostnameOrIpAddress("127.0.0.1")

    assert.deepStrictEqual(result, {
      input: "127.0.0.1",
      hostnameType: "ip",
      addresses: ["example.com"],
    })
  })

  it("resolves a hostname using lookup", async () => {
    mock.method(dns,"lookup", async () => [
      { address: "192.168.1.10", family: 4 },
      { address: "192.168.1.11", family: 4 },
    ])

    const result = await resolveHostnameOrIpAddress("my-host")

    assert.strictEqual(result.input, "my-host")
    assert.strictEqual(result.hostnameType, "hostname")
    assert.deepStrictEqual(result.addresses, [
      "192.168.1.10",
      "192.168.1.11",
    ])
  })

  it("returns the original input as address if resolution fails", async () => {
    mock.method(dns, "lookup", async () => {
      throw new Error("DNS failure")
    })

    const result = await resolveHostnameOrIpAddress("bad-host")

    assert.deepStrictEqual(result, {
      input: "bad-host",
      hostnameType: "hostname",
      addresses: ["bad-host"],
    })
  })
})

describe("returnIfDuplicateConnection", () => {
  beforeEach(() => {
    mock.restoreAll()
  })

  it("sends a fulfilled message if a duplicate connection exists", async () => {
    mock.method(dns, "lookup", async () => [
      { address: "10.0.0.1", family: 4 },
    ])

    const clients = new Map()
    clients.set(sanitizeUrl("10.0.0.1:6379"), {} as any)

    const ws = {
      send: mock.fn(),
    } as any

    await returnIfDuplicateConnection(
      { connectionId: "abc123", connectionDetails: { host: "my-host", port: "6379", tls: false, verifyTlsCertificate: false } },
      clients,
      ws,
    )

    assert.strictEqual(ws.send.mock.calls.length, 1)

    const sent = JSON.parse(ws.send.mock.calls[0].arguments[0])
    assert.deepStrictEqual(sent, {
      type: VALKEY.CONNECTION.standaloneConnectFulfilled,
      payload: { connectionId: "abc123" },
    })
  })

  it("does nothing if no duplicate connection exists", async () => {
    mock.method(dns, "lookup", async () => [
      { address: "10.0.0.2", family: 4 },
    ])

    const clients = new Map()

    const ws = {
      send: mock.fn(),
    } as any

    await returnIfDuplicateConnection(
      { connectionId: "abc123", connectionDetails: { host: "my-host", port: "6379", tls: false, verifyTlsCertificate: false } },
      clients,
      ws,
    )

    assert.strictEqual(ws.send.mock.calls.length, 0)
  })
})
