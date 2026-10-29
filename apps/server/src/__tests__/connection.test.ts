/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, mock, beforeEach, afterEach } from "node:test"
import assert from "node:assert"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { GlideClient, GlideClusterClient, InfoOptions } from "@valkey/valkey-glide"
import { buildConnectionId, KEY_EVICTION_POLICY, VALKEY, toNodeId } from "valkey-common"
import { GoogleAuth } from "google-auth-library"
import {
  connectToValkey,
  discoverCluster,
  getExistingConnection,
  teardownConnection
} from "../connection"
import { checkJsonModuleAvailability } from "../check-json-module"
import { ConnectionDetails } from "../actions/connection"
import { type MetricsServerMap } from "../metrics-orchestrator"
import { createOwnerState, type OwnerState } from "../owner"
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
  /** Answer for `CONFIG GET cluster-databases` (Valkey 9 clusters). */
  clusterDatabases?: string
  /** Simulate `CONFIG GET` being denied (e.g. by ACL). */
  configGetError?: boolean
  /** Inject extra delay before resolving — used to widen race windows in dedupe tests. */
  delayMs?: number
}

const buildStandaloneMock = ({
  serverInfo = "redis_version:8.0.0\r\n",
  clusterEnabled = "0",
  databases = "16",
  clusterDatabases,
  configGetError = false,
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
  configGet: mock.fn(async (keys: string[]) => {
    if (configGetError) throw new Error("NOPERM this user has no permissions to run the 'config|get' command")
    if (keys?.includes("cluster-databases")) {
      return clusterDatabases !== undefined ? { "cluster-databases": clusterDatabases } : {}
    }
    return { databases }
  }),
  close: mock.fn(),
  ...(delayMs !== undefined && {}),
})

const buildClusterMock = (overrides: { delayMs?: number, clusterDatabases?: string } = {}) => {
  return {
    info: mock.fn(async () => ({ node1: "maxmemory_policy:allkeys-lfu" })),
    customCommand: mock.fn(async (args: string[]) => {
      if (args[0] === "CLUSTER" && args[1] === "SLOTS") return SLOTS_RESPONSE
      if (args[0] === "CLUSTER" && args[1] === "SLOT-STATS") return []
      if (args[0] === "JSON.TYPE") throw new Error("not available")
      return []
    }),
    configGet: mock.fn(async (keys: string[]) => {
      if (keys?.includes("cluster-databases") && overrides.clusterDatabases !== undefined) {
        return { "cluster-databases": overrides.clusterDatabases }
      }
      return {}
    }),
    close: mock.fn(),
  }
}

// Configs of AUTH probe clients opened inside `withMockedClients`.
const authProbeCalls: any[] = []

async function withMockedClients<T>(
  standalone: unknown | (() => unknown),
  cluster: unknown | null,
  fn: () => Promise<T>,
  opts: { delayMs?: number } = {},
): Promise<T> {
  const originalCreateClient = GlideClient.createClient
  const originalCreateClusterClient = GlideClusterClient.createClient

  const standaloneFactory = typeof standalone === "function"
    ? standalone as (config?: unknown) => unknown
    : () => standalone

  // Every connect first opens a short-lived AUTH probe client
  // (`valkey_admin_auth_probe`). Probe calls are answered by a separate mock and
  // recorded in `authProbeCalls`, so `GlideClient.createClient` counts only the
  // working clients, as before the probe existed. The probe also runs
  // `INFO cluster` and `CLUSTER SLOTS`, which it answers like the standalone
  // mock would, so the connect sees the same topology either way.
  const realCreate = mock.fn(async (config?: unknown) => {
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs))
    return standaloneFactory(config) as any
  })
  const dispatch = async (config: any) => {
    if (config?.clientName === "valkey_admin_auth_probe") {
      authProbeCalls.push(config)
      const answers = standaloneFactory(config) as any
      return { info: answers.info, customCommand: answers.customCommand, close: mock.fn() } as any
    }
    return realCreate(config)
  }
  GlideClient.createClient = Object.assign(dispatch, { mock: realCreate.mock }) as any
  if (cluster !== null) {
    GlideClusterClient.createClient = mock.fn(async () => {
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs))
      return cluster as any
    })
  }
  authProbeCalls.length = 0
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
  let owner: OwnerState
  beforeEach(() => {
    messages = []
    mockWs = {
      send: mock.fn((msg: string) => messages.push(msg)),
    }
    // One owner per test. Its in-flight maps are shared by every ctx() call in
    // the test, so concurrent connects dedupe as they do in production.
    owner = createOwnerState("password~user0")
    clients = owner.clients
    connectedNodesByCluster = new Map()
    metricsServerMap = owner.metricsServerMap
    // metricsServerMap is keyed by metrics-node-id; the empty Connection_Identifier
    // strips to the empty string, which matches the empty connectionId used by
    // the default payload in these tests.
    metricsServerMap.set(toNodeId(DEFAULT_PAYLOAD.connectionId), {
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
  })

  const ctx = () => ({ ...owner, connectedNodesByCluster })

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
        databasesCount: 16,
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
      // Both connectors proved their credentials (AUTH-gated reuse).
      assert.strictEqual(authProbeCalls.length, 2)
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
        tls: true,
        verifyTlsCertificate: true,
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

  // A temporary CA file plus VALKEY_CA_CERT_PATH pointing at it, for tests that
  // need a verified channel. Restores the env afterwards.
  const ENV_CA_PEM = "-----BEGIN CERTIFICATE-----\nenvca\n-----END CERTIFICATE-----\n"
  const withServerCa = async (fn: (caPath: string) => Promise<void>, pem = ENV_CA_PEM) => {
    const caPath = path.join(os.tmpdir(), `valkey-ca-env-${process.pid}-${Date.now()}-${Math.random()}.pem`)
    fs.writeFileSync(caPath, pem)
    const prior = process.env.VALKEY_CA_CERT_PATH
    process.env.VALKEY_CA_CERT_PATH = caPath
    try {
      await fn(caPath)
    } finally {
      if (prior === undefined) delete process.env.VALKEY_CA_CERT_PATH
      else process.env.VALKEY_CA_CERT_PATH = prior
      fs.rmSync(caPath, { force: true })
    }
  }

  const gcpDetails = () => ({
    ...DEFAULT_PAYLOAD.connectionDetails,
    authType: "gcp-iam" as const,
    username: "ignored@project.iam.gserviceaccount.com",
    tls: true,
    verifyTlsCertificate: true,
    password: undefined,
  })

  it("should mint an access token as the password when authType is gcp-iam", async () => {
    const standalone = buildStandaloneMock({ clusterEnabled: "1" })
    const cluster = buildClusterMock()
    mock.method(GoogleAuth.prototype, "getAccessToken", async () => "fake-gcp-token")

    const gcpPayload = { ...DEFAULT_PAYLOAD, connectionDetails: gcpDetails() }

    await withServerCa(() => withMockedClients(standalone, cluster, async () => {
      await connectToValkey(ctx(), mockWs, gcpPayload)

      const calls = (GlideClusterClient.createClient as any).mock.calls
      assert.ok(calls.length > 0)
      const config = calls[0].arguments[0]
      assert.strictEqual(config.credentials.password, "fake-gcp-token")
      assert.strictEqual(config.credentials.username, "default")
      assert.strictEqual(config.credentials.iamConfig, undefined)
    }))
  })

  it("rejects gcp-iam when VALKEY_CA_CERT_PATH is not set, before a token is minted", async () => {
    const standalone = buildStandaloneMock({ clusterEnabled: "1" })
    const cluster = buildClusterMock()
    const mint = mock.method(GoogleAuth.prototype, "getAccessToken", async () => "fake-gcp-token")
    const prior = process.env.VALKEY_CA_CERT_PATH
    delete process.env.VALKEY_CA_CERT_PATH
    try {
      await withMockedClients(standalone, cluster, async () => {
        const result = await connectToValkey(ctx(), mockWs, { ...DEFAULT_PAYLOAD, connectionDetails: gcpDetails() })
        assert.strictEqual(result, undefined)
        assert.strictEqual(mint.mock.calls.length, 0, "no token must be minted")
        assert.strictEqual((GlideClusterClient.createClient as any).mock.calls.length, 0)
        assert.strictEqual((GlideClient.createClient as any).mock.calls.length, 0)
        const rejected = (mockWs.send as any).mock.calls
          .map((c: any) => JSON.parse(c.arguments[0]))
          .find((m: any) => m.type === VALKEY.CONNECTION.connectRejected)
        assert.match(rejected.payload.errorMessage, /VALKEY_CA_CERT_PATH/)
      })
    } finally {
      if (prior !== undefined) process.env.VALKEY_CA_CERT_PATH = prior
    }
  })

  it("rejects iam without TLS before any client is created", async () => {
    const standalone = buildStandaloneMock({ clusterEnabled: "1" })
    const cluster = buildClusterMock()
    const details = {
      ...DEFAULT_PAYLOAD.connectionDetails,
      authType: "iam" as const,
      awsRegion: "us-east-1",
      awsReplicationGroupId: "my-cluster",
      password: undefined,
    }
    for (const transport of [{ tls: false, verifyTlsCertificate: false }, { tls: true, verifyTlsCertificate: false }]) {
      await withMockedClients(standalone, cluster, async () => {
        const result = await connectToValkey(ctx(), mockWs, { ...DEFAULT_PAYLOAD, connectionDetails: { ...details, ...transport } })
        assert.strictEqual(result, undefined)
        assert.strictEqual((GlideClusterClient.createClient as any).mock.calls.length, 0)
        assert.strictEqual((GlideClient.createClient as any).mock.calls.length, 0)
        assert.strictEqual(authProbeCalls.length, 0, "the AUTH probe must not run")
      })
    }
  })

  it("rejects gcp-iam without TLS instead of sending the token in cleartext", async () => {
    const standalone = buildStandaloneMock({ clusterEnabled: "1" })
    const cluster = buildClusterMock()
    mock.method(GoogleAuth.prototype, "getAccessToken", async () => "fake-gcp-token")

    const insecurePayload = {
      ...DEFAULT_PAYLOAD,
      connectionDetails: {
        ...DEFAULT_PAYLOAD.connectionDetails,
        authType: "gcp-iam" as const,
        tls: false,
        password: undefined,
      },
    }

    await withMockedClients(standalone, cluster, async () => {
      const result = await connectToValkey(ctx(), mockWs, insecurePayload)
      assert.strictEqual(result, undefined)
      assert.strictEqual((GlideClusterClient.createClient as any).mock.calls.length, 0)
      assert.strictEqual((GlideClient.createClient as any).mock.calls.length, 0)
    })
  })

  it("rejects gcp-iam when certificate verification is disabled", async () => {
    const standalone = buildStandaloneMock({ clusterEnabled: "1" })
    const cluster = buildClusterMock()
    mock.method(GoogleAuth.prototype, "getAccessToken", async () => "fake-gcp-token")

    const insecurePayload = {
      ...DEFAULT_PAYLOAD,
      connectionDetails: {
        ...DEFAULT_PAYLOAD.connectionDetails,
        authType: "gcp-iam" as const,
        tls: true,
        verifyTlsCertificate: false,
        password: undefined,
      },
    }

    await withMockedClients(standalone, cluster, async () => {
      const result = await connectToValkey(ctx(), mockWs, insecurePayload)
      assert.strictEqual(result, undefined)
      assert.strictEqual((GlideClusterClient.createClient as any).mock.calls.length, 0)
      assert.strictEqual((GlideClient.createClient as any).mock.calls.length, 0)
    })
  })

  it("ignores a client-supplied caCertPath and uses VALKEY_CA_CERT_PATH", async () => {
    const standalone = buildStandaloneMock({ clusterEnabled: "1" })
    const cluster = buildClusterMock()
    const clientCaPath = path.join(os.tmpdir(), `valkey-ca-client-${process.pid}-${Date.now()}.pem`)
    fs.writeFileSync(clientCaPath, "-----BEGIN CERTIFICATE-----\nclientca\n-----END CERTIFICATE-----\n")

    const tlsPayload = {
      ...DEFAULT_PAYLOAD,
      connectionDetails: {
        ...DEFAULT_PAYLOAD.connectionDetails,
        tls: true,
        verifyTlsCertificate: true,
        caCertPath: clientCaPath,
      },
    }

    try {
      await withServerCa(() => withMockedClients(standalone, cluster, async () => {
        await connectToValkey(ctx(), mockWs, tlsPayload)
        for (const config of [authProbeCalls[0], (GlideClusterClient.createClient as any).mock.calls[0].arguments[0]]) {
          const ca = config.advancedConfiguration.tlsAdvancedConfiguration.rootCertificates
          assert.ok(Buffer.isBuffer(ca))
          assert.match(ca.toString(), /envca/)
          assert.doesNotMatch(ca.toString(), /clientca/)
        }
      }))
    } finally {
      fs.rmSync(clientCaPath, { force: true })
    }
  })

  it("uses no CA when the client sends caCertPath and VALKEY_CA_CERT_PATH is unset", async () => {
    const standalone = buildStandaloneMock({ clusterEnabled: "1" })
    const cluster = buildClusterMock()
    const prior = process.env.VALKEY_CA_CERT_PATH
    delete process.env.VALKEY_CA_CERT_PATH
    try {
      await withMockedClients(standalone, cluster, async () => {
        await connectToValkey(ctx(), mockWs, {
          ...DEFAULT_PAYLOAD,
          connectionDetails: { ...DEFAULT_PAYLOAD.connectionDetails, tls: true, verifyTlsCertificate: true, caCertPath: "/etc/passwd" },
        })
        const config = (GlideClusterClient.createClient as any).mock.calls[0].arguments[0]
        assert.strictEqual(config.advancedConfiguration.tlsAdvancedConfiguration, undefined)
      })
    } finally {
      if (prior !== undefined) process.env.VALKEY_CA_CERT_PATH = prior
    }
  })

  it("does not copy caCertPath into discovered cluster node maps", async () => {
    const client = buildStandaloneMock({ clusterEnabled: "1" }) as any
    const { discoveredClusterNodes } = await discoverCluster(client, {
      connectionDetails: { ...DEFAULT_PAYLOAD.connectionDetails, caCertPath: "/etc/passwd" },
    })
    for (const node of Object.values(discoveredClusterNodes)) {
      assert.strictEqual("caCertPath" in node, false)
    }
  })

  it("falls back to VALKEY_CA_CERT_PATH when the payload has no caCertPath", async () => {
    const standalone = buildStandaloneMock({ clusterEnabled: "1" })
    const cluster = buildClusterMock()
    const caPath = path.join(os.tmpdir(), `valkey-ca-env-${process.pid}-${Date.now()}.pem`)
    fs.writeFileSync(caPath, "-----BEGIN CERTIFICATE-----\nenvca\n-----END CERTIFICATE-----\n")
    const priorCaCertPath = process.env.VALKEY_CA_CERT_PATH
    process.env.VALKEY_CA_CERT_PATH = caPath

    // The UI has no CA field, so a UI-initiated payload carries no caCertPath.
    const tlsPayload = {
      ...DEFAULT_PAYLOAD,
      connectionDetails: {
        ...DEFAULT_PAYLOAD.connectionDetails,
        tls: true,
        verifyTlsCertificate: true,
        caCertPath: undefined,
      },
    }

    try {
      await withMockedClients(standalone, cluster, async () => {
        await connectToValkey(ctx(), mockWs, tlsPayload)
        const config = (GlideClusterClient.createClient as any).mock.calls[0].arguments[0]
        const ca = config.advancedConfiguration.tlsAdvancedConfiguration.rootCertificates
        assert.ok(Buffer.isBuffer(ca))
        assert.match(ca.toString(), /envca/)
      })
    } finally {
      if (priorCaCertPath === undefined) delete process.env.VALKEY_CA_CERT_PATH
      else process.env.VALKEY_CA_CERT_PATH = priorCaCertPath
      fs.rmSync(caPath, { force: true })
    }
  })

  it("should handle connection errors", async () => {
    const error = new Error("Connection failed")
    const originalCreateClient = GlideClient.createClient
    GlideClient.createClient = mock.fn(async () => { throw error })

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
    assert.strictEqual(await checkJsonModuleAvailability(mockClient as any, "test-conn-id"), true)
  })

  it("should return false when JSON module is not present", async () => {
    const mockClient = { customCommand: mock.fn(async () => { throw Error }) }
    assert.strictEqual(await checkJsonModuleAvailability(mockClient as any, "test-conn-id"), false)
  })

  it("should return false without probing JSON.TYPE when COMMAND INFO replies [null]", async () => {
    const mockClient = { customCommand: mock.fn(async () => [null]) }
    assert.strictEqual(await checkJsonModuleAvailability(mockClient as any, "test-conn-id"), false)
    assert.strictEqual(mockClient.customCommand.mock.callCount(), 1)
  })

  it("should fall back to JSON.TYPE when COMMAND INFO is not permitted", async () => {
    const mockClient = {
      customCommand: mock.fn(async (args: string[]) => {
        if (args[0] === "COMMAND") throw new Error("NOPERM")
        return null
      }),
    }
    assert.strictEqual(await checkJsonModuleAvailability(mockClient as any, "test-conn-id"), true)
    assert.deepStrictEqual(mockClient.customCommand.mock.calls[1].arguments[0], ["JSON.TYPE", "nonexistent_key"])
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
        tls: true,
        verifyTlsCertificate: true,
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
        /Database_Index 16 is out of range: this server has databases = 16 \(valid range 0\.\.15\)/,
      )
      // The reject must fire on the db-less probe, BEFORE a db-bound client is
      // built — otherwise Glide's handshake SELECT fails first with a raw error.
      assert.strictEqual(
        (GlideClient.createClient as any).mock.calls.length,
        1,
        "out-of-range reject must happen on the probe, before the db-bound rebuild",
      )
    })
  })

  it("accepts db: 31 when the server reports databases = 32 and returns databasesCount", async () => {
    await withMockedClients(buildStandaloneMock({ databases: "32" }), null, async () => {
      const connectionId = buildConnectionId("127.0.0.1", "6379", 31)
      await connectToValkey(ctx(), mockWs, {
        connectionId,
        connectionDetails: { ...DEFAULT_PAYLOAD.connectionDetails, db: 31 },
      })

      assert.strictEqual(clients.has(connectionId), true)
      const calls = (GlideClient.createClient as any).mock.calls
      assert.strictEqual(calls.length, 2)
      assert.strictEqual(calls[1].arguments[0].databaseId, 31)

      const fulfilled = messages
        .map((m) => JSON.parse(m))
        .find((m) => m.type === VALKEY.CONNECTION.standaloneConnectFulfilled)
      assert.ok(fulfilled)
      assert.strictEqual(fulfilled.payload.connectionDetails.databasesCount, 32)
    })
  })

  it("forwards a >16 databasesCount when reusing an already-connected standalone client", async () => {
    const standalone = buildStandaloneMock({ databases: "64" })
    await withMockedClients(standalone, null, async () => {
      // Seed the registry so the existing-connection early return handles this
      // connect; that path reads the count independently of the fresh path.
      clients.set(DEFAULT_PAYLOAD.connectionId, { client: standalone })

      await connectToValkey(ctx(), mockWs, DEFAULT_PAYLOAD)

      const fulfilled = messages
        .map((m) => JSON.parse(m))
        .find((m) => m.type === VALKEY.CONNECTION.standaloneConnectFulfilled)
      assert.ok(fulfilled)
      assert.strictEqual(fulfilled.payload.connectionDetails.databasesCount, 64)
    })
  })

  describe("AUTH-gated reuse", () => {
    it("gives two owners on one connectionId two clients and keeps both", async () => {
      const aliceClient = buildStandaloneMock()
      const bobClient = buildStandaloneMock()
      const clientsFor = [aliceClient, bobClient]
      const alice = { ...createOwnerState("password~user0"), connectedNodesByCluster: new Map() }
      const bob = { ...createOwnerState("password~bob"), connectedNodesByCluster: new Map() }
      // The probe takes a fresh mock; only working clients consume the queue.
      const factory = (config: any) => config?.clientName === "valkey_admin_auth_probe" ? buildStandaloneMock() : clientsFor.shift()
      await withMockedClients(factory, null, async () => {
        await connectToValkey(alice, mockWs, { ...DEFAULT_PAYLOAD, connectionId: "conn-O" })
        await connectToValkey(bob, mockWs, {
          ...DEFAULT_PAYLOAD,
          connectionId: "conn-O",
          connectionDetails: { ...DEFAULT_PAYLOAD.connectionDetails, username: "bob", password: "bobpw" },
        })
      })
      assert.strictEqual(alice.clients.get("conn-O")?.client, aliceClient)
      assert.strictEqual(bob.clients.get("conn-O")?.client, bobClient)
      assert.strictEqual(aliceClient.close.mock.calls.length, 0)
      assert.strictEqual(bobClient.close.mock.calls.length, 0)
    })
    const wrongPass = () => new Error("WRONGPASS: invalid username-password pair or user is disabled.")

    it("authenticates the presented credentials before it reuses an existing client", async () => {
      const existing = buildStandaloneMock()
      const probe = buildStandaloneMock()
      clients.set("conn-R", { client: existing })

      await withMockedClients(probe, null, async () => {
        const result = await connectToValkey(ctx(), mockWs, { ...DEFAULT_PAYLOAD, connectionId: "conn-R" })

        assert.strictEqual((GlideClient.createClient as any).mock.calls.length, 0, "reuse opens no working client")
        assert.strictEqual(authProbeCalls.length, 1, "reuse must open exactly one probe client")
        assert.deepStrictEqual(authProbeCalls[0].credentials, {
          username: DEFAULT_PAYLOAD.connectionDetails.username,
          password: DEFAULT_PAYLOAD.connectionDetails.password,
        })
        assert.strictEqual(result, existing)
        assert.strictEqual(clients.get("conn-R")?.client, existing)
      })
    })

    it("rejects a wrong password and leaves the existing client open", async () => {
      const existing = buildStandaloneMock()
      clients.set("conn-R", { client: existing })
      const original = GlideClient.createClient
      GlideClient.createClient = mock.fn(async () => { throw wrongPass() }) as any
      try {
        const result = await connectToValkey(ctx(), mockWs, {
          ...DEFAULT_PAYLOAD,
          connectionId: "conn-R",
          connectionDetails: { ...DEFAULT_PAYLOAD.connectionDetails, password: "wrong" },
        })
        assert.strictEqual(result, undefined)
        const sent = messages.map((m) => JSON.parse(m))
        assert.strictEqual(sent.at(-1).type, VALKEY.CONNECTION.connectRejected)
        assert.strictEqual(existing.close.mock.calls.length, 0, "the existing client must stay open")
        assert.strictEqual(clients.get("conn-R")?.client, existing)
      } finally {
        GlideClient.createClient = original
      }
    })

    it("does not close the existing client when a retry fails to authenticate", async () => {
      const existing = buildStandaloneMock()
      clients.set("conn-R", { client: existing })
      const original = GlideClient.createClient
      GlideClient.createClient = mock.fn(async () => { throw wrongPass() }) as any
      try {
        await connectToValkey(ctx(), mockWs, {
          ...DEFAULT_PAYLOAD,
          connectionId: "conn-R",
          connectionDetails: { ...DEFAULT_PAYLOAD.connectionDetails, password: "wrong" },
          isRetry: true,
        })
        assert.strictEqual(existing.close.mock.calls.length, 0, "a failed retry must not close the client")
        assert.strictEqual(clients.get("conn-R")?.client, existing)
      } finally {
        GlideClient.createClient = original
      }
    })
  })

  it("skips the proactive range check when CONFIG GET is denied and still connects", async () => {
    await withMockedClients(buildStandaloneMock({ configGetError: true }), null, async () => {
      const connectionId = buildConnectionId("127.0.0.1", "6379", 20)
      await connectToValkey(ctx(), mockWs, {
        connectionId,
        connectionDetails: { ...DEFAULT_PAYLOAD.connectionDetails, db: 20 },
      })

      // The count is unknowable, so the server must not guess-and-reject; the
      // connection attempt itself decides. The mock accepts, and the payload
      // omits `databasesCount` entirely rather than substituting a default —
      // a fabricated 16 would cap the Edit form below the server's real range.
      assert.strictEqual(clients.has(connectionId), true)
      const fulfilled = messages
        .map((m) => JSON.parse(m))
        .find((m) => m.type === VALKEY.CONNECTION.standaloneConnectFulfilled)
      assert.ok(fulfilled)
      assert.ok(
        !("databasesCount" in fulfilled.payload.connectionDetails),
        "an unreadable count must be omitted, not defaulted",
      )
    })
  })

  it("classifies Glide's db-switch handshake failure into a verbose message", async () => {
    // First createClient call (probe) succeeds; second (db-bound rebuild)
    // rejects the way Glide does when the server refuses SELECT.
    let call = 0
    const standaloneFactory = () => {
      call += 1
      if (call === 2) {
        throw new Error(
          "Failed to create initial connections: Redis server refused to switch database",
        )
      }
      return buildStandaloneMock({ configGetError: true })
    }

    await withMockedClients(standaloneFactory, null, async () => {
      const connectionId = buildConnectionId("127.0.0.1", "6379", 5)
      await connectToValkey(ctx(), mockWs, {
        connectionId,
        connectionDetails: { ...DEFAULT_PAYLOAD.connectionDetails, db: 5 },
      })

      assert.strictEqual(clients.has(connectionId), false)
      const rejected = messages
        .map((m) => JSON.parse(m))
        .find((m) => m.type === VALKEY.CONNECTION.connectRejected)
      assert.ok(rejected)
      assert.match(
        rejected.payload.errorMessage,
        /Database_Index 5 is not enabled on this server \(it rejected SELECT 5\)/,
      )
      assert.match(rejected.payload.errorMessage, /CONFIG GET databases/)
    })
  })

  it("rejects a cluster db beyond cluster-databases before creating the cluster client", async () => {
    const standalone = buildStandaloneMock({
      serverInfo: "valkey_version:9.0.0\r\n",
      clusterEnabled: "1",
      clusterDatabases: "4",
    })
    const cluster = buildClusterMock({ clusterDatabases: "4" })

    await withMockedClients(standalone, cluster, async () => {
      const connectionId = buildConnectionId("127.0.0.1", "6379", 8)
      await connectToValkey(ctx(), mockWs, {
        connectionId,
        connectionDetails: { ...DEFAULT_PAYLOAD.connectionDetails, db: 8 },
      })

      assert.strictEqual(clients.has(connectionId), false)
      assert.strictEqual(
        (GlideClusterClient.createClient as any).mock.calls.length,
        0,
        "no cluster client should be created when the db is out of range",
      )
      const rejected = messages
        .map((m) => JSON.parse(m))
        .find((m) => m.type === VALKEY.CONNECTION.connectRejected)
      assert.ok(rejected)
      assert.match(
        rejected.payload.errorMessage,
        /Database_Index 8 is out of range: this cluster has cluster-databases = 4 \(valid range 0\.\.3\)/,
      )
    })
  })

  it("accepts a cluster db within cluster-databases and returns databasesCount", async () => {
    const standalone = buildStandaloneMock({
      serverInfo: "valkey_version:9.0.0\r\n",
      clusterEnabled: "1",
      clusterDatabases: "4",
    })
    const cluster = buildClusterMock({ clusterDatabases: "4" })

    await withMockedClients(standalone, cluster, async () => {
      const connectionId = buildConnectionId("127.0.0.1", "6379", 2)
      await connectToValkey(ctx(), mockWs, {
        connectionId,
        connectionDetails: { ...DEFAULT_PAYLOAD.connectionDetails, db: 2 },
      })

      assert.strictEqual(clients.get(connectionId)?.client, cluster)
      const calls = (GlideClusterClient.createClient as any).mock.calls
      assert.strictEqual(calls.length, 1)
      assert.strictEqual(calls[0].arguments[0].databaseId, 2)

      const fulfilled = messages
        .map((m) => JSON.parse(m))
        .find((m) => m.type === VALKEY.CONNECTION.clusterConnectFulfilled)
      assert.ok(fulfilled)
      assert.strictEqual(fulfilled.payload.connectionDetails.databasesCount, 4)
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
describe("getExistingConnection", () => {
  it("returns the entry stored at connectionId when present", () => {
    const directClient = {} as any
    const clients = new Map()
    clients.set("abc123", { client: directClient })

    const result = getExistingConnection({ connectionId: "abc123" }, clients)

    assert.ok(result)
    assert.strictEqual(result.client, directClient)
  })

  it("returns undefined when isRetry is true even if an entry exists", () => {
    const clients = new Map()
    clients.set("abc123", { client: {} as any })
    assert.strictEqual(getExistingConnection({ connectionId: "abc123", isRetry: true }, clients), undefined)
  })

  // The DNS branch is gone: two spellings of one host are two ids within an
  // owner, and an attacker-controlled name can no longer resolve into a reuse.
  it("does not resolve the host to find a match", () => {
    const clients = new Map()
    clients.set(buildConnectionId("10.0.0.1", "6379", 0), { client: {} as any })
    assert.strictEqual(getExistingConnection({ connectionId: buildConnectionId("my-host", "6379", 0) }, clients), undefined)
  })

  it("never sees another owner's client, because each owner has its own map", () => {
    const otherOwnerClients = new Map()
    otherOwnerClients.set("abc123", { client: {} as any })
    assert.strictEqual(getExistingConnection({ connectionId: "abc123" }, new Map()), undefined)
  })

  // `a.b` and `a-b` share a connectionId. Since the owner key includes the
  // endpoint they are two owners, so each owner's map holds only its own client
  // for that id.
  it("two owners whose connectionIds collide each reuse only their own client", () => {
    const id = buildConnectionId("a.b", "6379", 0)
    assert.strictEqual(id, buildConnectionId("a-b", "6379", 0))
    const dotClient = {} as any
    const dashClient = {} as any
    const dotOwner = createOwnerState("password~default@a.b:6379")
    const dashOwner = createOwnerState("password~default@a-b:6379")
    dotOwner.clients.set(id, { client: dotClient })
    dashOwner.clients.set(id, { client: dashClient })
    assert.strictEqual(getExistingConnection({ connectionId: id }, dotOwner.clients)?.client, dotClient)
    assert.strictEqual(getExistingConnection({ connectionId: id }, dashOwner.clients)?.client, dashClient)
  })
})

describe("teardownConnection", () => {
  it("should close client when no other entry shares it", () => {
    const mockClient = { close: mock.fn() }
    const clients: Map<string, any> = new Map()
    clients.set("conn-1", { client: mockClient })
    const metricsServerMap: MetricsServerMap = new Map()

    teardownConnection({ ...createOwnerState("password~t"), clients, metricsServerMap }, "conn-1")

    assert.strictEqual(clients.has("conn-1"), false)
    assert.strictEqual(mockClient.close.mock.calls.length, 1)
  })

  it("should NOT close client when another entry still shares it", () => {
    const sharedClient = { close: mock.fn() }
    const clients: Map<string, any> = new Map()
    clients.set("node-1", { client: sharedClient, clusterId: "c1" })
    clients.set("node-2", { client: sharedClient, clusterId: "c1" })
    const metricsServerMap: MetricsServerMap = new Map()

    teardownConnection({ ...createOwnerState("password~t"), clients, metricsServerMap }, "node-1")

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

    const ctx = { ...createOwnerState("password~t"), clients, metricsServerMap }
    teardownConnection(ctx, "node-1")
    teardownConnection(ctx, "node-2")

    assert.strictEqual(clients.size, 0)
    assert.strictEqual(sharedClient.close.mock.calls.length, 1)
  })

  it("should be a no-op when connectionId is not in clients", () => {
    const clients: Map<string, any> = new Map()
    const metricsServerMap: MetricsServerMap = new Map()

    assert.doesNotThrow(() => {
      teardownConnection({ ...createOwnerState("password~t"), clients, metricsServerMap }, "unknown")
    })
  })
})

describe("closeMetricsServer", () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("should send the db-stripped nodeId in the close request body, not the full connectionId", async () => {
    const { closeMetricsServer } = await import("../connection")
    let capturedBody: string | undefined

    globalThis.fetch = mock.fn(async (_url: string, opts?: any) => {
      capturedBody = opts?.body
      return { ok: true } as Response
    }) as any

    const connectionId = "127-0-0-1-7000-db2"
    const expectedNodeId = "127-0-0-1-7000"
    const metricsServerMap: MetricsServerMap = new Map()
    metricsServerMap.set(expectedNodeId, { metricsURI: "http://localhost:9999", pid: 123, lastSeen: Date.now() })
    const clients: Map<string, any> = new Map()

    await closeMetricsServer(connectionId, { metricsServerMap, clients, collectorKeys: new Map() })

    const parsed = JSON.parse(capturedBody!)
    assert.strictEqual(parsed.connectionId, expectedNodeId,
      "close request should send the db-stripped nodeId, not the full connectionId")
    assert.strictEqual(metricsServerMap.has(expectedNodeId), false,
      "metrics server entry should be deleted after successful close")
  })

  it("should not close if other connections still reference the same node", async () => {
    const { closeMetricsServer } = await import("../connection")

    globalThis.fetch = mock.fn(async () => ({ ok: true }) as Response) as any

    const connectionId = "127-0-0-1-7000-db0"
    const nodeId = "127-0-0-1-7000"
    const metricsServerMap: MetricsServerMap = new Map()
    metricsServerMap.set(nodeId, { metricsURI: "http://localhost:9999", pid: 123, lastSeen: Date.now() })
    // Another connection on db1 still references the same node
    const clients: Map<string, any> = new Map()
    clients.set("127-0-0-1-7000-db1", { client: {} })

    await closeMetricsServer(connectionId, { metricsServerMap, clients, collectorKeys: new Map() })

    assert.strictEqual((globalThis.fetch as any).mock.calls.length, 0,
      "should not call close when other connections still reference the node")
    assert.strictEqual(metricsServerMap.has(nodeId), true,
      "metrics server entry should remain")
  })
})
