/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, mock, beforeEach, afterEach } from "node:test"
import assert from "node:assert"
import { GlideClient, GlideClusterClient, InfoOptions } from "@valkey/valkey-glide"
import { buildConnectionId, KEY_EVICTION_POLICY, VALKEY } from "valkey-common"
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
    db: 0,
  } as ConnectionDetails,
  connectionId: "",
}

const SLOTS_RESPONSE = [
  [0, 5460, ["192.168.1.1", 6379, "node-1"], ["192.168.1.2", 6379, "replica-1"]],
  [5461, 10922, ["192.168.1.3", 6379, "node-2"]],
  [10923, 16383, ["192.168.1.4", 6379, "node-3"]],
] as const

type StandaloneOverrides = {
  serverInfo?: string
  clusterEnabled?: "0" | "1"
  databases?: string | undefined
  /** Inject extra delay before resolving — used to widen race windows in dedupe tests. */
  delayMs?: number
}

const buildStandaloneMock = ({
  serverInfo = "redis_version:8.0.0\r\n",
  clusterEnabled = "0",
  databases = "16",
  delayMs,
}: StandaloneOverrides = {}) => ({
  info: mock.fn(async (sections: string[]) => {
    if (sections?.includes(InfoOptions.Server)) return serverInfo
    if (sections?.includes(InfoOptions.Memory)) {
      return clusterEnabled === "1"
        ? "maxmemory_policy:allkeys-lfu"
        : { node1: "maxmemory_policy:allkeys-lfu" }
    }
    return `cluster_enabled:${clusterEnabled}`
  }),
  customCommand: mock.fn(async (args: string[]) => {
    if (args[0] === "CLUSTER" && args[1] === "SLOTS") return SLOTS_RESPONSE
    if (args[0] === "MODULE" && args[1] === "LIST") {
      return [[{ key: "name", value: "rejson" }]]
    }
    if (args[0] === "CONFIG" && args[1] === "GET" && args[2] === "maxmemory-policy") {
      return [{ key: "maxmemory-policy", value: "allkeys-lfu" }]
    }
    if (args[0] === "CONFIG" && args[1] === "SET") return "OK"
    if (Array.isArray(args) && args[0] === "JSON.TYPE") throw Error
    return []
  }),
  configGet: mock.fn(async () => ({ databases })),
  close: mock.fn(),
  ...(delayMs !== undefined && {}),
})

const buildClusterMock = (overrides: { delayMs?: number } = {}) => {
  void overrides
  return {
    info: mock.fn(async () => ({ node1: "maxmemory_policy:allkeys-lfu" })),
    customCommand: mock.fn(async (args: string[]) => {
      if (args[0] === "CLUSTER" && args[1] === "SLOTS") return SLOTS_RESPONSE
      if (args[0] === "CLUSTER" && args[1] === "SLOT-STATS") return []
      if (args[0] === "JSON.TYPE") throw new Error("not available")
      return []
    }),
    close: mock.fn(),
  }
}

async function withMockedClients<T>(
  standalone: unknown | (() => unknown),
  cluster: unknown | null,
  fn: () => Promise<T>,
  opts: { delayMs?: number } = {},
): Promise<T> {
  const originalCreateClient = GlideClient.createClient
  const originalCreateClusterClient = GlideClusterClient.createClient

  const standaloneFactory = typeof standalone === "function"
    ? standalone as () => unknown
    : () => standalone

  GlideClient.createClient = mock.fn(async () => {
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs))
    return standaloneFactory() as any
  })
  if (cluster !== null) {
    GlideClusterClient.createClient = mock.fn(async () => {
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs))
      return cluster as any
    })
  }
  try {
    return await fn()
  } finally {
    GlideClient.createClient = originalCreateClient
    GlideClusterClient.createClient = originalCreateClusterClient
  }
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

  const ctx = () => ({ clients, connectedNodesByCluster, clusterNodesRegistry: {}, metricsServerMap })

  it("should connect to standalone Valkey instance", async () => {
    const standalone = buildStandaloneMock()
    await withMockedClients(standalone, null, async () => {
      const result = await connectToValkey(ctx(), mockWs, DEFAULT_PAYLOAD)

      assert.ok(result)
      assert.strictEqual(clients.get(DEFAULT_PAYLOAD.connectionId).client, standalone)
      assert.strictEqual(mockWs.send.mock.calls.length, 1)

      const sent = JSON.parse(messages[0])
      assert.strictEqual(sent.type, VALKEY.CONNECTION.standaloneConnectFulfilled)
      assert.strictEqual(sent.payload.connectionId, DEFAULT_PAYLOAD.connectionId)
      assert.deepStrictEqual(sent.payload.connectionDetails, {
        keyEvictionPolicy: KEY_EVICTION_POLICY.ALLKEYS_LFU,
        jsonModuleAvailable: false,
      })
    })
  })

  it("should connect to cluster Valkey instance", async () => {
    const standalone = buildStandaloneMock({ clusterEnabled: "1" })
    const cluster = buildClusterMock()

    await withMockedClients(standalone, cluster, async () => {
      await connectToValkey(ctx(), mockWs, DEFAULT_PAYLOAD)

      assert.strictEqual(clients.get(DEFAULT_PAYLOAD.connectionId).client, cluster)

      const parsed = messages.map((m) => JSON.parse(m))
      assert.ok(parsed.find((m) => m.type === VALKEY.CLUSTER.addCluster))
      const fulfilled = parsed.find((m) => m.type === VALKEY.CONNECTION.clusterConnectFulfilled)
      assert.ok(fulfilled)
      assert.strictEqual(fulfilled.payload.connectionId, DEFAULT_PAYLOAD.connectionId)
    })
  })

  it("dedupes cluster client creation across concurrent connectors to the same cluster", async () => {
    const sharedCluster = buildClusterMock()

    await withMockedClients(
      // Each connector gets a fresh standalone mock so the discovery client
      // call counts reflect per-connector state, not a shared singleton.
      () => buildStandaloneMock({ clusterEnabled: "1" }),
      sharedCluster,
      async () => {
        const payloadA = { ...DEFAULT_PAYLOAD, connectionId: "conn-A" }
        const payloadB = { ...DEFAULT_PAYLOAD, connectionId: "conn-B" }

        await Promise.all([
          connectToValkey(ctx(), mockWs, payloadA),
          connectToValkey(ctx(), mockWs, payloadB),
        ])

        assert.strictEqual(
          (GlideClusterClient.createClient as any).mock.calls.length,
          1,
          "expected exactly one cluster client creation",
        )

        const a = clients.get("conn-A")
        const b = clients.get("conn-B")
        assert.ok(a && b)
        assert.strictEqual(a.client, sharedCluster)
        assert.strictEqual(b.client, sharedCluster)
        assert.strictEqual(a.clusterId, b.clusterId)
      },
      // Delay both factories so both connectors race within the in-flight window.
      { delayMs: 25 },
    )
  })

  it("dedupes standalone client creation across concurrent connectors with the same connectionId", async () => {
    const standalone = buildStandaloneMock()

    await withMockedClients(standalone, null, async () => {
      const payload = { ...DEFAULT_PAYLOAD, connectionId: "conn-shared" }
      const [a, b] = await Promise.all([
        connectToValkey(ctx(), mockWs, payload),
        connectToValkey(ctx(), mockWs, payload),
      ])

      assert.strictEqual(
        (GlideClient.createClient as any).mock.calls.length,
        1,
        "expected exactly one standalone client creation",
      )
      assert.strictEqual(a, standalone)
      assert.strictEqual(b, standalone)
      assert.strictEqual(clients.get("conn-shared")?.client, standalone)
    }, { delayMs: 25 })
  })

  it("reuses cluster client on sequential connect with the same connectionId", async () => {
    const standalone = buildStandaloneMock({ clusterEnabled: "1" })
    const cluster = buildClusterMock()

    await withMockedClients(standalone, cluster, async () => {
      const payload = { ...DEFAULT_PAYLOAD, connectionId: "conn-Z" }
      const first = await connectToValkey(ctx(), mockWs, payload)
      assert.strictEqual(first, cluster)
      assert.strictEqual((GlideClusterClient.createClient as any).mock.calls.length, 1)

      messages.length = 0

      // Same connectionId again: must hit the early-return cluster reuse path.
      const second = await connectToValkey(ctx(), mockWs, payload)
      assert.strictEqual(second, cluster)
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
    })
  })

  it("should use iamConfig credentials when authType is iam", async () => {
    const standalone = buildStandaloneMock({ clusterEnabled: "1" })
    const cluster = buildClusterMock()

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

    await withMockedClients(standalone, cluster, async () => {
      await connectToValkey(ctx(), mockWs, iamPayload)

      const calls = (GlideClusterClient.createClient as any).mock.calls
      assert.ok(calls.length > 0)
      const config = calls[0].arguments[0]
      assert.strictEqual(config.credentials.iamConfig.clusterName, "my-cluster")
      assert.strictEqual(config.credentials.iamConfig.region, "us-east-1")
      assert.strictEqual(config.credentials.password, undefined)
    })
  })

  it("should handle connection errors", async () => {
    const error = new Error("Connection failed")
    const originalCreateClient = GlideClient.createClient
    GlideClient.createClient = mock.fn(async () => { throw error })
    mock.method(dns, "reverse", async () => ["localhost"])

    try {
      const result = await connectToValkey(ctx(), mockWs, DEFAULT_PAYLOAD)

      assert.strictEqual(result, undefined)
      assert.strictEqual(clients.has(DEFAULT_PAYLOAD.connectionId), false)
      assert.strictEqual(mockWs.send.mock.calls.length, 1)

      const sent = JSON.parse(messages[0])
      assert.strictEqual(sent.type, VALKEY.CONNECTION.connectRejected)
      assert.strictEqual(sent.payload.connectionId, DEFAULT_PAYLOAD.connectionId)
      assert.ok(sent.payload.errorMessage)
    } finally {
      GlideClient.createClient = originalCreateClient
    }
  })

  it("should use correct client configuration", async () => {
    const standalone = buildStandaloneMock()
    const altPayload = {
      connectionDetails: {
        host: "192.168.1.1",
        port: "7000",
        username: "user1",
        password: "helloWorld456!",
        tls: false,
        verifyTlsCertificate: false,
        endpointType: "node",
        db: 0,
      } as ConnectionDetails,
      connectionId: "conn-456",
    }

    await withMockedClients(standalone, null, async () => {
      await connectToValkey(ctx(), mockWs, altPayload)

      const calls = (GlideClient.createClient as any).mock.calls
      assert.strictEqual(calls.length, 1)
      const config = calls[0].arguments[0]
      assert.deepStrictEqual(config.addresses, [{
        host: altPayload.connectionDetails.host,
        port: Number(altPayload.connectionDetails.port),
      }])
      assert.strictEqual(config.requestTimeout, 5000)
      assert.strictEqual(config.clientName, "valkey_admin_standalone_client")
    })
  })

  it("should store client in clients map with correct connectionId", async () => {
    const standalone = buildStandaloneMock()
    const payload = { ...DEFAULT_PAYLOAD, connectionId: "unique-conn-id" }

    await withMockedClients(standalone, null, async () => {
      await connectToValkey(ctx(), mockWs, payload)
      assert.ok(clients.has(payload.connectionId))
      assert.strictEqual(clients.get(payload.connectionId).client, standalone)
    })
  })

  it("should detect JSON module availability", async () => {
    const mockClient = {
      customCommand: mock.fn(async () => [
        [{ key: "name", value: "json" }, { key: "ver", value: 10002 }],
      ]),
    }
    assert.strictEqual(await checkJsonModuleAvailability(mockClient as any), true)
  })

  it("should return false when JSON module is not present", async () => {
    const mockClient = { customCommand: mock.fn(async () => { throw Error }) }
    assert.strictEqual(await checkJsonModuleAvailability(mockClient as any), false)
  })

  type ReplaceCase = {
    name: string
    overrides: Partial<ConnectionDetails>
    cluster?: true
    assertConfig: (config: any) => void
  }

  const REPLACE_CASES: ReplaceCase[] = [
    {
      name: "credentials change",
      overrides: { password: "newPassword!" },
      assertConfig: (c) => assert.strictEqual(c.credentials.password, "newPassword!"),
    },
    {
      name: "TLS toggle",
      overrides: { tls: true },
      assertConfig: (c) => assert.strictEqual(c.useTLS, true),
    },
    {
      name: "verifyTlsCertificate toggle",
      overrides: { tls: true, verifyTlsCertificate: false },
      assertConfig: (c) =>
        assert.strictEqual(c.advancedConfiguration?.tlsAdvancedConfiguration?.insecure, true),
    },
    {
      name: "IAM region change",
      overrides: {
        authType: "iam" as const,
        awsRegion: "us-west-2",
        awsReplicationGroupId: "my-cluster",
        password: undefined,
      },
      cluster: true,
      assertConfig: (c) => assert.strictEqual(c.credentials.iamConfig.region, "us-west-2"),
    },
  ]

  for (const tc of REPLACE_CASES) {
    it(`replaces client under same connectionId on ${tc.name} (isRetry: true)`, async () => {
      const oldClient = { close: mock.fn() } as any
      const newStandalone = buildStandaloneMock(tc.cluster ? { clusterEnabled: "1" } : {})
      const newCluster = tc.cluster ? buildClusterMock() : null

      const connectionId = buildConnectionId("127.0.0.1", "6379", 0)
      clients.set(connectionId, { client: oldClient })

      await withMockedClients(newStandalone, newCluster, async () => {
        await connectToValkey(ctx(), mockWs, {
          connectionId,
          connectionDetails: { ...DEFAULT_PAYLOAD.connectionDetails, ...tc.overrides },
          isRetry: true,
        })

        const stored = clients.get(connectionId)
        assert.ok(stored, "entry should still exist under same connectionId")
        assert.strictEqual(stored.client, tc.cluster ? newCluster : newStandalone)

        const calls = tc.cluster
          ? (GlideClusterClient.createClient as any).mock.calls
          : (GlideClient.createClient as any).mock.calls
        assert.strictEqual(calls.length, 1)
        tc.assertConfig(calls[0].arguments[0])
      })
    })
  }

  it("defaults databases to 16 and accepts db: 15, forwarding databaseId to Glide", async () => {
    await withMockedClients(buildStandaloneMock({ databases: undefined }), null, async () => {
      const connectionId = buildConnectionId("127.0.0.1", "6379", 15)
      await connectToValkey(ctx(), mockWs, {
        connectionId,
        connectionDetails: { ...DEFAULT_PAYLOAD.connectionDetails, db: 15 },
      })

      assert.strictEqual(clients.has(connectionId), true)
      // Two GlideClient creations: a db-less probe used to detect cluster
      // mode without issuing `SELECT`, then the real standalone client bound
      // to the requested db.
      const calls = (GlideClient.createClient as any).mock.calls
      assert.strictEqual(calls.length, 2)
      assert.strictEqual(
        calls[0].arguments[0].databaseId,
        undefined,
        "probe must not bind a database (cluster nodes reject SELECT)",
      )
      assert.strictEqual(
        calls[1].arguments[0].databaseId,
        15,
        "real standalone client must bind to the requested db",
      )
    })
  })

  it("defaults databases to 16 and rejects db: 16 when CONFIG GET returns no parseable value", async () => {
    await withMockedClients(buildStandaloneMock({ databases: undefined }), null, async () => {
      const connectionId = buildConnectionId("127.0.0.1", "6379", 16)
      await connectToValkey(ctx(), mockWs, {
        connectionId,
        connectionDetails: { ...DEFAULT_PAYLOAD.connectionDetails, db: 16 },
      })

      assert.strictEqual(clients.has(connectionId), false)
      const rejected = messages
        .map((m) => JSON.parse(m))
        .find((m) => m.type === VALKEY.CONNECTION.connectRejected)
      assert.ok(rejected)
      assert.match(
        rejected.payload.errorMessage,
        /Database_Index 16 is out of range \(server allows 0\.\.15\)/,
      )
    })
  })

  type GatingCase = {
    name: string
    serverInfo: string
    expectAccept: boolean
    expectMessageMatch?: RegExp
  }

  const GATING_CASES: GatingCase[] = [
    {
      // A real Valkey 9.0 server emits both fields; the legacy `redis_version` is a
      // Redis-compat number (e.g. 7.4) that would falsely fail the >= 9 check if it
      // were preferred. This is the regression test for that bug.
      name: "valkey_version takes precedence over legacy redis_version on real Valkey servers",
      serverInfo: "redis_version:7.4.0\r\nvalkey_version:9.0.0\r\nredis_mode:cluster",
      expectAccept: true,
    },
    {
      name: "valkey_version only (no redis_version) on cluster >= 9.0.0",
      serverInfo: "valkey_version:9.0.0\r\nsome_other_field:value",
      expectAccept: true,
    },
    {
      name: "pre-release suffix (9.0.0-rc1) on cluster",
      serverInfo: "redis_version:9.0.0-rc1\r\nredis_mode:cluster",
      expectAccept: true,
    },
    {
      name: "both redis_version and valkey_version missing",
      serverInfo: "redis_mode:cluster\r\nos:Linux",
      expectAccept: false,
      expectMessageMatch: /Cluster server version unknown does not support a non-zero Database_Index/,
    },
  ]

  for (const tc of GATING_CASES) {
    it(`cluster gating: ${tc.name}`, async () => {
      const standalone = buildStandaloneMock({ serverInfo: tc.serverInfo, clusterEnabled: "1" })
      const cluster = buildClusterMock()

      await withMockedClients(standalone, cluster, async () => {
        const connectionId = buildConnectionId("127.0.0.1", "6379", 1)
        await connectToValkey(ctx(), mockWs, {
          connectionId,
          connectionDetails: { ...DEFAULT_PAYLOAD.connectionDetails, db: 1 },
        })

        if (tc.expectAccept) {
          assert.strictEqual(clients.get(connectionId)?.client, cluster)
          const calls = (GlideClusterClient.createClient as any).mock.calls
          assert.strictEqual(calls.length, 1)
          assert.strictEqual(calls[0].arguments[0].databaseId, 1)
        } else {
          assert.strictEqual(clients.has(connectionId), false)
          assert.strictEqual(
            (GlideClusterClient.createClient as any).mock.calls.length,
            0,
            "no cluster client should be created when gating fails",
          )
          const rejected = messages
            .map((m) => JSON.parse(m))
            .find((m) => m.type === VALKEY.CONNECTION.connectRejected)
          assert.ok(rejected)
          assert.match(rejected.payload.errorMessage, tc.expectMessageMatch!)
        }
      })
    })
  }

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
    clients.set(buildConnectionId("10.0.0.1", "6379", 0), { client: existingClient })

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
    clients.set(buildConnectionId("10.0.0.1", "6379", 0), { client: {} as any })

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

    teardownConnection(
      { clients, clusterNodesRegistry: {}, metricsServerMap },
      "conn-1",
    )

    assert.strictEqual(clients.has("conn-1"), false)
    assert.strictEqual(mockClient.close.mock.calls.length, 1)
  })

  it("should NOT close client when another entry still shares it", () => {
    const sharedClient = { close: mock.fn() }
    const clients: Map<string, any> = new Map()
    clients.set("node-1", { client: sharedClient, clusterId: "c1" })
    clients.set("node-2", { client: sharedClient, clusterId: "c1" })
    const metricsServerMap: MetricsServerMap = new Map()

    teardownConnection(
      { clients, clusterNodesRegistry: {}, metricsServerMap },
      "node-1",
    )

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

    const ctx = { clients, clusterNodesRegistry: {}, metricsServerMap }
    teardownConnection(ctx, "node-1")
    teardownConnection(ctx, "node-2")

    assert.strictEqual(clients.size, 0)
    assert.strictEqual(sharedClient.close.mock.calls.length, 1)
  })

  it("should be a no-op when connectionId is not in clients", () => {
    const clients: Map<string, any> = new Map()
    const metricsServerMap: MetricsServerMap = new Map()

    assert.doesNotThrow(() => {
      teardownConnection(
        { clients, clusterNodesRegistry: {}, metricsServerMap },
        "unknown",
      )
    })
  })
})
