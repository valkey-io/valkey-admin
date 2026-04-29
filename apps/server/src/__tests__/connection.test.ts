/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, mock, beforeEach, afterEach } from "node:test"
import assert from "node:assert"
import { GlideClient, GlideClusterClient } from "@valkey/valkey-glide"
import { sanitizeUrl, KEY_EVICTION_POLICY, VALKEY } from "valkey-common"
import {
  _resetConnectInFlight,
  _resetInFlightClusterClients,
  connectToValkey,
  getExistingConnection,
  teardownConnection
} from "../connection"
import { resolveHostnameOrIpAddress, dns } from "../utils"
import { checkJsonModuleAvailability } from "../check-json-module"
import { ConnectionDetails } from "../actions/connection"
import { type MetricsServerMap } from "../metrics-orchestrator"
import { _reset as resetNodeWatchers } from "../node-watchers"

const DEFAULT_PAYLOAD = {
  connectionDetails: {
    host: "127.0.0.1",
    port: "6379",
    username: "user0",
    password: "helloWorld123!",
    tls: false,
    verifyTlsCertificate: false,
    endpointType: "node",
  } as ConnectionDetails,
  connectionId: "",
}

describe("connectToValkey", () => {
  let mockWs: any
  let messages: string[]
  let clients: Map<string, any>
  let connectedNodesByCluster: Map<string, string[]>
  let metricsServerMap: MetricsServerMap
  beforeEach(() => {
    messages = []
    mockWs = {
      send: mock.fn((msg: string) => messages.push(msg)),
    }
    clients = new Map()
    connectedNodesByCluster = new Map() 
    metricsServerMap = new Map()
    metricsServerMap.set(DEFAULT_PAYLOAD.connectionId, {
      metricsURI: "http://localhost:1234",
      pid: 12345,
      lastSeen: Date.now(),
    })
  })

  afterEach(async () => {
    for (const connection of clients.values()) {
      await connection.client.close?.()
      await connection.client.quit?.()
    }
    mock.restoreAll()
    clients.clear()
    connectedNodesByCluster.clear()
    resetNodeWatchers()
    _resetInFlightClusterClients()
    _resetConnectInFlight()
  })

  async function runClusterConnectionTest(payloadOverrides: Partial<any> = {}) {
    const mockStandaloneClient = {
      info: mock.fn(async () => "cluster_enabled:1\r\nmaxmemory_policy:allkeys-lfu"),
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
            [0, 5460, ["192.168.1.1", 6379, "node-1"], ["192.168.1.2", 6379, "replica-1"]],
            [5461, 10922, ["192.168.1.3", 6379, "node-2"]],
            [10923, 16383, ["192.168.1.4", 6379, "node-3"]],
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
      info: mock.fn(async () => ({ node1: "maxmemory_policy:allkeys-lfu" })),
      customCommand: mock.fn(async (args: string[]) => {
        if (args[0] === "CLUSTER" && args[1] === "SLOTS") {
          return [
            [0, 5460, ["192.168.1.1", 6379, "node-1"], ["192.168.1.2", 6379, "replica-1"]],
            [5461, 10922, ["192.168.1.3", 6379, "node-2"]],
            [10923, 16383, ["192.168.1.4", 6379, "node-3"]],
          ]
        }
        if (args[0] === "CLUSTER" && args[1] === "SLOT-STATS") return []
        if (args[0] === "JSON.TYPE") throw new Error("not available")
        return []
      }),
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
      await connectToValkey(mockWs, payload, clients, connectedNodesByCluster, metricsServerMap, {})
      const connection = clients.get(payload.connectionId)
      assert.strictEqual(connection.client, mockClusterClient)

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
      info: mock.fn(async (sections: string[]) =>
        sections?.includes("memory")
          ? { node1: "maxmemory_policy:allkeys-lfu" }
          : "cluster_enabled:0",
      ),
      customCommand: mock.fn(async (args: string[]) => {
        if (
          Array.isArray(args) &&
          args[0] === "JSON.TYPE"
        ) throw Error
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
      const result = await connectToValkey(mockWs, payload, clients, connectedNodesByCluster, metricsServerMap, {})

      assert.ok(result)
      const connection = clients.get(payload.connectionId)
      assert.strictEqual(connection.client, mockStandaloneClient)
      assert.strictEqual(mockWs.send.mock.calls.length, 1)

      const sentMessage = JSON.parse(messages[0])
      assert.strictEqual(
        sentMessage.type,
        VALKEY.CONNECTION.standaloneConnectFulfilled,
      )
      assert.strictEqual(sentMessage.payload.connectionId, payload.connectionId)
      assert.deepStrictEqual(
        sentMessage.payload.connectionDetails,
        {
          keyEvictionPolicy: KEY_EVICTION_POLICY.ALLKEYS_LFU,
          jsonModuleAvailable: false,
        },
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

  it("dedupes cluster client creation across concurrent connectors to the same cluster", async () => {

    let standaloneId = 0
    const buildStandalone = () => ({
      info: mock.fn(async () => "cluster_enabled:1\r\nmaxmemory_policy:allkeys-lfu"),
      customCommand: mock.fn(async (args: string[]) => {
        if (args[0] === "CLUSTER" && args[1] === "SLOTS") {
          return [
            [0, 5460, ["192.168.1.1", 6379, "node-1"]],
            [5461, 10922, ["192.168.1.3", 6379, "node-2"]],
            [10923, 16383, ["192.168.1.4", 6379, "node-3"]],
          ]
        }
        return []
      }),
      close: mock.fn(),
      _id: ++standaloneId,
    })

    const sharedClusterClient = {
      info: mock.fn(async () => ({ node1: "maxmemory_policy:allkeys-lfu" })),
      customCommand: mock.fn(async (args: string[]) => {
        if (args[0] === "CLUSTER" && args[1] === "SLOTS") {
          return [
            [0, 5460, ["192.168.1.1", 6379, "node-1"]],
            [5461, 10922, ["192.168.1.3", 6379, "node-2"]],
            [10923, 16383, ["192.168.1.4", 6379, "node-3"]],
          ]
        }
        if (args[0] === "CLUSTER" && args[1] === "SLOT-STATS") return []
        if (args[0] === "JSON.TYPE") throw new Error("not available")
        return []
      }),
      close: mock.fn(),
    }

    const originalCreateClient = GlideClient.createClient
    const originalCreateClusterClient = GlideClusterClient.createClient

    GlideClient.createClient = mock.fn(async () => buildStandalone() as any)

    // Delay cluster client creation so both connectors race within the in-flight window.
    GlideClusterClient.createClient = mock.fn(async () => {
      await new Promise((res) => setTimeout(res, 25))
      return sharedClusterClient as any
    })

    try {
      const payloadA = { ...DEFAULT_PAYLOAD, connectionId: "conn-A" }
      const payloadB = { ...DEFAULT_PAYLOAD, connectionId: "conn-B" }

      await Promise.all([
        connectToValkey(mockWs, payloadA, clients, connectedNodesByCluster, metricsServerMap, {}),
        connectToValkey(mockWs, payloadB, clients, connectedNodesByCluster, metricsServerMap, {}),
      ])

      const createCalls = (GlideClusterClient.createClient as any).mock.calls.length
      assert.strictEqual(createCalls, 1, "expected exactly one cluster client creation")

      const a = clients.get("conn-A")
      const b = clients.get("conn-B")
      assert.ok(a && b)
      assert.strictEqual(a.client, sharedClusterClient)
      assert.strictEqual(b.client, sharedClusterClient)
      assert.strictEqual(a.clusterId, b.clusterId)
    } finally {
      GlideClient.createClient = originalCreateClient
      GlideClusterClient.createClient = originalCreateClusterClient
    }
  })

  it("dedupes standalone client creation across concurrent connectors with the same connectionId", async () => {
    const mockStandaloneClient = {
      info: mock.fn(async (sections: string[]) =>
        sections?.includes("memory")
          ? { node1: "maxmemory_policy:allkeys-lfu" }
          : "cluster_enabled:0",
      ),
      customCommand: mock.fn(async (args: string[]) => {
        if (Array.isArray(args) && args[0] === "JSON.TYPE") throw Error
        return []
      }),
      close: mock.fn(),
    }

    const originalCreateClient = GlideClient.createClient
    // Delay to widen the race window so both connectors are in flight together.
    GlideClient.createClient = mock.fn(async () => {
      await new Promise((res) => setTimeout(res, 25))
      return mockStandaloneClient as any
    })

    try {
      const payload = { ...DEFAULT_PAYLOAD, connectionId: "conn-shared" }

      const [a, b] = await Promise.all([
        connectToValkey(mockWs, payload, clients, connectedNodesByCluster, metricsServerMap, {}),
        connectToValkey(mockWs, payload, clients, connectedNodesByCluster, metricsServerMap, {}),
      ])

      assert.strictEqual(
        (GlideClient.createClient as any).mock.calls.length,
        1,
        "expected exactly one standalone client creation",
      )
      assert.strictEqual(a, mockStandaloneClient)
      assert.strictEqual(b, mockStandaloneClient)
      assert.strictEqual(clients.get("conn-shared")?.client, mockStandaloneClient)
    } finally {
      GlideClient.createClient = originalCreateClient
    }
  })

  it("reuses cluster client on sequential connect with the same connectionId", async () => {
    const mockStandaloneClient = {
      info: mock.fn(async () => "cluster_enabled:1\r\nmaxmemory_policy:allkeys-lfu"),
      customCommand: mock.fn(async (args: string[]) => {
        if (args[0] === "CLUSTER" && args[1] === "SLOTS") {
          return [
            [0, 5460, ["192.168.1.1", 6379, "node-1"]],
            [5461, 10922, ["192.168.1.3", 6379, "node-2"]],
            [10923, 16383, ["192.168.1.4", 6379, "node-3"]],
          ]
        }
        return []
      }),
      close: mock.fn(),
    }

    const mockClusterClient = {
      info: mock.fn(async () => ({ node1: "maxmemory_policy:allkeys-lfu" })),
      customCommand: mock.fn(async (args: string[]) => {
        if (args[0] === "CLUSTER" && args[1] === "SLOTS") {
          return [
            [0, 5460, ["192.168.1.1", 6379, "node-1"]],
            [5461, 10922, ["192.168.1.3", 6379, "node-2"]],
            [10923, 16383, ["192.168.1.4", 6379, "node-3"]],
          ]
        }
        if (args[0] === "CLUSTER" && args[1] === "SLOT-STATS") return []
        if (args[0] === "JSON.TYPE") throw new Error("not available")
        return []
      }),
      close: mock.fn(),
    }

    const originalCreateClient = GlideClient.createClient
    const originalCreateClusterClient = GlideClusterClient.createClient
    GlideClient.createClient = mock.fn(async () => mockStandaloneClient as any)
    GlideClusterClient.createClient = mock.fn(async () => mockClusterClient as any)

    try {
      const payload = { ...DEFAULT_PAYLOAD, connectionId: "conn-Z" }
      const registry = {}

      const first = await connectToValkey(
        mockWs, payload, clients, connectedNodesByCluster, metricsServerMap, registry,
      )
      assert.strictEqual(first, mockClusterClient)
      assert.strictEqual((GlideClusterClient.createClient as any).mock.calls.length, 1)

      messages.length = 0

      // Same connectionId again: must hit the early-return cluster reuse path,
      // not create a new cluster client.
      const second = await connectToValkey(
        mockWs, payload, clients, connectedNodesByCluster, metricsServerMap, registry,
      )

      assert.strictEqual(second, mockClusterClient)
      assert.strictEqual(
        (GlideClusterClient.createClient as any).mock.calls.length,
        1,
        "second sequential connect must not create a new cluster client",
      )

      const parsed = messages.map((m) => JSON.parse(m))
      assert.ok(
        parsed.find((m) => m.type === VALKEY.CLUSTER.addCluster),
        "second connect should re-emit addCluster",
      )
      assert.ok(
        parsed.find((m) => m.type === VALKEY.CONNECTION.clusterConnectFulfilled),
        "second connect should re-emit clusterConnectFulfilled",
      )
    } finally {
      GlideClient.createClient = originalCreateClient
      GlideClusterClient.createClient = originalCreateClusterClient
    }
  })

  it("should use iamConfig credentials when authType is iam", async () => {
    const originalCreateClusterClient = GlideClusterClient.createClient
    const originalCreateClient = GlideClient.createClient

    const mockStandaloneClient = {
      info: mock.fn(async () => "cluster_enabled:1\r\nmaxmemory_policy:allkeys-lfu"),
      customCommand: mock.fn(async (args: string[]) => {
        if (args[0] === "CLUSTER" && args[1] === "SLOTS") {
          return [
            [0, 5460, ["192.168.1.1", 6379, "node-1"], ["192.168.1.2", 6379, "replica-1"]],
            [5461, 10922, ["192.168.1.3", 6379, "node-2"]],
            [10923, 16383, ["192.168.1.4", 6379, "node-3"]],
          ]
        }
        if (args[0] === "CLUSTER" && args[1] === "SLOT-STATS") return []
        if (args[0] === "JSON.TYPE") throw new Error("not available")
        return []
      }),
      close: mock.fn(),
    }
    const mockClusterClient = { ...mockStandaloneClient }

    GlideClient.createClient = mock.fn(async () => mockStandaloneClient as any)
    GlideClusterClient.createClient = mock.fn(async () => mockClusterClient as any)

    const iamPayload = {
      ...DEFAULT_PAYLOAD,
      connectionDetails: {
        ...DEFAULT_PAYLOAD.connectionDetails,
        authType: "iam" as const,
        awsRegion: "us-east-1",
        awsReplicationGroupId: "my-cluster",
        password: undefined,
      },
    }

    try {
      await connectToValkey(mockWs, iamPayload, clients, connectedNodesByCluster, metricsServerMap, {})

      const calls = (GlideClusterClient.createClient as unknown as ReturnType<typeof mock.fn>).mock.calls
      assert.ok(calls.length > 0)
      const calledWith = calls[0].arguments[0] as any
      assert.strictEqual(calledWith.credentials.iamConfig.clusterName, "my-cluster")
      assert.strictEqual(calledWith.credentials.iamConfig.region, "us-east-1")
      assert.strictEqual(calledWith.credentials.password, undefined)
    } finally {
      GlideClusterClient.createClient = originalCreateClusterClient
      GlideClient.createClient = originalCreateClient
    }
  })

  it("should handle connection errors", async () => {
    const error = new Error("Connection failed")
    const originalCreateClient = GlideClient.createClient
    GlideClient.createClient = mock.fn(async () => {
      throw error
    })
    mock.method(dns, "reverse", async () => ["localhost"])

    try {
      const result = await connectToValkey(mockWs, DEFAULT_PAYLOAD, clients, connectedNodesByCluster, metricsServerMap, {})

      assert.strictEqual(result, undefined)
      assert.strictEqual(clients.has(DEFAULT_PAYLOAD.connectionId), false)
      assert.strictEqual(mockWs.send.mock.calls.length, 1)

      const sentMessage = JSON.parse(messages[0])
      assert.strictEqual(sentMessage.type, VALKEY.CONNECTION.connectRejected)
      assert.strictEqual(sentMessage.payload.connectionId, DEFAULT_PAYLOAD.connectionId)
      assert.ok(sentMessage.payload.errorMessage)
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
      assert.deepStrictEqual(config.addresses, [{
        host: alternate_payload.connectionDetails.host,
        port: Number(alternate_payload.connectionDetails.port),
      }])
      assert.strictEqual(config.requestTimeout, 5000)
      assert.strictEqual(config.clientName, "valkey_server_standalone_client")
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
        endpointType: "node",
      } as ConnectionDetails,
      connectionId: "",
    }

    try {
      await connectToValkey(mockWs, alternate_payload, clients, connectedNodesByCluster, metricsServerMap, {})
      assert.strictEqual((GlideClient.createClient as any).mock.calls.length, 1)

      const config = (GlideClient.createClient as any).mock.calls[0].arguments[0]
      assert.ok(config)
      assert.deepStrictEqual(config.addresses, [{
        host: alternate_payload.connectionDetails.host,
        port: Number(alternate_payload.connectionDetails.port),
      }])
      assert.strictEqual(config.requestTimeout, 5000)
      assert.strictEqual(config.clientName, "valkey_server_standalone_client")
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
      await connectToValkey(mockWs, payload, clients, connectedNodesByCluster, metricsServerMap, {})
      assert.ok(clients.has(uniqueConnID))
      const connection = clients.get(uniqueConnID)
      assert.strictEqual(connection.client, mockStandaloneClient)
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
      customCommand: mock.fn(async () => { throw Error }),
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

describe("getExistingConnection", () => {
  beforeEach(() => {
    mock.restoreAll()
  })

  it("returns the existing connection when host:port resolves to one already in clients", async () => {
    mock.method(dns, "lookup", async () => [
      { address: "10.0.0.1", family: 4 },
    ])

    const existingClient = {} as any
    const clients = new Map()
    clients.set(sanitizeUrl("10.0.0.1:6379"), { client: existingClient })

    const result = await getExistingConnection(
      {
        connectionId: "abc123",
        connectionDetails: {
          host: "my-host", port: "6379", tls: false, verifyTlsCertificate: false, endpointType: "node",
        } as any,
      },
      clients,
    )

    assert.ok(result)
    assert.strictEqual(result.client, existingClient)
  })

  it("returns undefined when no resolved address matches any client", async () => {
    mock.method(dns, "lookup", async () => [
      { address: "10.0.0.2", family: 4 },
    ])

    const clients = new Map()

    const result = await getExistingConnection(
      {
        connectionId: "abc123",
        connectionDetails: {
          host: "my-host", port: "6379", tls: false, verifyTlsCertificate: false, endpointType: "node",
        } as any,
      },
      clients,
    )

    assert.strictEqual(result, undefined)
  })

  it("returns undefined when isRetry is true even if a duplicate exists", async () => {
    mock.method(dns, "lookup", async () => [
      { address: "10.0.0.1", family: 4 },
    ])

    const clients = new Map()
    clients.set(sanitizeUrl("10.0.0.1:6379"), { client: {} as any })

    const result = await getExistingConnection(
      {
        connectionId: "abc123",
        isRetry: true,
        connectionDetails: {
          host: "my-host", port: "6379", tls: false, verifyTlsCertificate: false, endpointType: "node",
        } as any,
      },
      clients,
    )

    assert.strictEqual(result, undefined)
  })

  it("returns the entry stored at connectionId when present", async () => {
    mock.method(dns, "lookup", async () => [
      { address: "10.0.0.99", family: 4 },
    ])

    const directClient = {} as any
    const clients = new Map()
    clients.set("abc123", { client: directClient })

    const result = await getExistingConnection(
      {
        connectionId: "abc123",
        connectionDetails: {
          host: "my-host", port: "6379", tls: false, verifyTlsCertificate: false, endpointType: "node",
        } as any,
      },
      clients,
    )

    assert.ok(result)
    assert.strictEqual(result.client, directClient)
  })
})

describe("teardownConnection", () => {
  it("should close client when no other entry shares it", () => {
    const mockClient = { close: mock.fn() }
    const clients: Map<string, any> = new Map()
    clients.set("conn-1", { client: mockClient })
    const metricsServerMap: MetricsServerMap = new Map()

    teardownConnection("conn-1", clients, metricsServerMap)

    assert.strictEqual(clients.has("conn-1"), false)
    assert.strictEqual(mockClient.close.mock.calls.length, 1)
  })

  it("should NOT close client when another entry still shares it", () => {
    const sharedClient = { close: mock.fn() }
    const clients: Map<string, any> = new Map()
    clients.set("node-1", { client: sharedClient, clusterId: "c1" })
    clients.set("node-2", { client: sharedClient, clusterId: "c1" })
    const metricsServerMap: MetricsServerMap = new Map()

    teardownConnection("node-1", clients, metricsServerMap)

    assert.strictEqual(clients.has("node-1"), false)
    assert.strictEqual(clients.has("node-2"), true)
    assert.strictEqual(sharedClient.close.mock.calls.length, 0)
  })

  it("should close client when last shared entry is torn down", () => {
    const sharedClient = { close: mock.fn() }
    const clients: Map<string, any> = new Map()
    clients.set("node-1", { client: sharedClient, clusterId: "c1" })
    clients.set("node-2", { client: sharedClient, clusterId: "c1" })
    const metricsServerMap: MetricsServerMap = new Map()

    teardownConnection("node-1", clients, metricsServerMap)
    teardownConnection("node-2", clients, metricsServerMap)

    assert.strictEqual(clients.size, 0)
    assert.strictEqual(sharedClient.close.mock.calls.length, 1)
  })

  it("should be a no-op when connectionId is not in clients", () => {
    const clients: Map<string, any> = new Map()
    const metricsServerMap: MetricsServerMap = new Map()

    assert.doesNotThrow(() => {
      teardownConnection("unknown", clients, metricsServerMap)
    })
  })
})
