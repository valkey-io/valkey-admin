/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, mock, beforeEach, afterEach } from "node:test"
import assert from "node:assert"
import { VALKEY, COMMANDLOG_TYPE } from "valkey-common"
import { hotKeysRequested } from "../actions/hotkeys"
import { commandLogsRequested } from "../actions/commandLogs"
import { ClusterRegistry } from "../metrics-orchestrator"

function createMockResponse(body: any, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  }
}

describe("hotKeysRequested reply shape", () => {
  let mockWs: any
  let messages: string[]
  let metricsServerMap: Map<string, any>
  let connectedNodesByCluster: Map<string, string[]>
  let clusterNodesRegistry: ClusterRegistry
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    messages = []
    mockWs = { send: mock.fn((msg: string) => messages.push(msg)) }
    metricsServerMap = new Map()
    connectedNodesByCluster = new Map()
    clusterNodesRegistry = {}
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function mockFetch(body: any, ok = true, status = 200) {
    const fetchCalls: string[] = []
    globalThis.fetch = (async (url: any) => {
      fetchCalls.push(String(url))
      return createMockResponse(body, ok, status)
    }) as any
    return fetchCalls
  }

  const deps = () => ({
    ws: mockWs, metricsServerMap, connectedNodesByCluster, clients: new Map(), connectionId: "", clusterNodesRegistry,
  } as any)

  it("standalone hotKeysFulfilled carries a db-less { nodeId } (db suffix stripped)", async () => {
    metricsServerMap.set("host-6379", { metricsURI: "http://localhost:9999" })
    mockFetch({ nodeId: "host-6379", hotKeys: [], checkAt: 0, monitorRunning: true, lastCollectedAt: null })

    const action = {
      type: VALKEY.HOTKEYS.hotKeysRequested,
      payload: { connectionId: "host-6379-db3" },
    }

    await hotKeysRequested(deps())(action as any)

    assert.strictEqual(messages.length, 1)
    const sent = JSON.parse(messages[0])
    assert.strictEqual(sent.type, VALKEY.HOTKEYS.hotKeysFulfilled)
    assert.strictEqual(sent.payload.nodeId, "host-6379")
    assert.strictEqual(sent.payload.connectionId, undefined)
    assert.strictEqual(sent.payload.clusterId, undefined)
  })

  it("standalone hotKeysError carries a db-less { nodeId } (db suffix stripped)", async () => {
    metricsServerMap.set("host-6379", { metricsURI: "http://localhost:9999" })
    mockFetch({ error: "boom" }, false, 500)

    const action = {
      type: VALKEY.HOTKEYS.hotKeysRequested,
      payload: { connectionId: "host-6379-db3" },
    }

    await hotKeysRequested(deps())(action as any)

    assert.strictEqual(messages.length, 1)
    const sent = JSON.parse(messages[0])
    assert.strictEqual(sent.type, VALKEY.HOTKEYS.hotKeysError)
    assert.strictEqual(sent.payload.nodeId, "host-6379")
    assert.strictEqual(sent.payload.connectionId, undefined)
    assert.strictEqual(sent.payload.error, "boom")
  })

  it("cluster hotKeysFulfilled carries { clusterId } and db-less nodeErrors[].nodeId", async () => {
    metricsServerMap.set("node-1", { metricsURI: "http://localhost:9001" })
    // node-2 has no metrics entry → surfaces as a nodeError with a db-less nodeId.
    clusterNodesRegistry = {
      "cluster-1": {
        "node-1": { host: "127.0.0.1", port: 7000, tls: false, verifyTlsCertificate: false },
        "node-2": { host: "127.0.0.1", port: 7001, tls: false, verifyTlsCertificate: false },
      },
    }
    mockFetch({ nodeId: "node-1", hotKeys: [], checkAt: 0, monitorRunning: true, lastCollectedAt: null })

    const action = {
      type: VALKEY.HOTKEYS.hotKeysRequested,
      payload: { connectionId: "node-1", clusterId: "cluster-1" },
    }

    await hotKeysRequested(deps())(action as any)

    assert.strictEqual(messages.length, 1)
    const sent = JSON.parse(messages[0])
    assert.strictEqual(sent.type, VALKEY.HOTKEYS.hotKeysFulfilled)
    assert.strictEqual(sent.payload.clusterId, "cluster-1")
    assert.strictEqual(sent.payload.nodeId, undefined)
    assert.strictEqual(sent.payload.connectionId, undefined)
    assert.ok(Array.isArray(sent.payload.nodeErrors))
    assert.strictEqual(sent.payload.nodeErrors[0].nodeId, "node-2")
    assert.ok(!/-db\d+$/.test(sent.payload.nodeErrors[0].nodeId))
  })
})

describe("commandLogsRequested reply shape", () => {
  let mockWs: any
  let messages: string[]
  let metricsServerMap: Map<string, any>
  let connectedNodesByCluster: Map<string, string[]>
  let clusterNodesRegistry: ClusterRegistry
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    messages = []
    mockWs = { send: mock.fn((msg: string) => messages.push(msg)) }
    metricsServerMap = new Map()
    connectedNodesByCluster = new Map()
    clusterNodesRegistry = {}
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function mockFetch(body: any, ok = true, status = 200) {
    const fetchCalls: string[] = []
    globalThis.fetch = (async (url: any) => {
      fetchCalls.push(String(url))
      return createMockResponse(body, ok, status)
    }) as any
    return fetchCalls
  }

  function mockFetchThrow(error: Error) {
    globalThis.fetch = (async () => { throw error }) as any
  }

  const deps = () => ({
    ws: mockWs, metricsServerMap, connectedNodesByCluster, clients: new Map(), connectionId: "", clusterNodesRegistry,
  } as any)

  it("standalone commandLogsFulfilled carries a db-less { nodeId } (db suffix stripped)", async () => {
    metricsServerMap.set("host-6379", { metricsURI: "http://localhost:9999" })
    mockFetch({ nodeId: "host-6379", rows: [], count: 0, checkAt: 0 })

    const action = {
      type: VALKEY.COMMANDLOGS.commandLogsRequested,
      payload: { connectionId: "host-6379-db1", commandLogType: COMMANDLOG_TYPE.SLOW },
    }

    await commandLogsRequested(deps())(action as any)

    assert.strictEqual(messages.length, 1)
    const sent = JSON.parse(messages[0])
    assert.strictEqual(sent.type, VALKEY.COMMANDLOGS.commandLogsFulfilled)
    assert.strictEqual(sent.payload.nodeId, "host-6379")
    assert.strictEqual(sent.payload.connectionId, undefined)
    assert.strictEqual(sent.payload.clusterId, undefined)
  })

  it("standalone commandLogsError carries a db-less { nodeId } (db suffix stripped)", async () => {
    metricsServerMap.set("host-6379", { metricsURI: "http://localhost:9999" })
    mockFetchThrow(new Error("network timeout"))

    const action = {
      type: VALKEY.COMMANDLOGS.commandLogsRequested,
      payload: { connectionId: "host-6379-db1", commandLogType: COMMANDLOG_TYPE.SLOW },
    }

    await commandLogsRequested(deps())(action as any)

    const errMsg = messages.map((m) => JSON.parse(m)).find((m) => m.type === VALKEY.COMMANDLOGS.commandLogsError)
    assert.ok(errMsg, "expected a commandLogsError message")
    assert.strictEqual(errMsg.payload.nodeId, "host-6379")
    assert.strictEqual(errMsg.payload.connectionId, undefined)
    assert.strictEqual(errMsg.payload.error, "network timeout")
  })

  it("cluster commandLogsFulfilled carries { clusterId } and db-less nodeErrors[].nodeId", async () => {
    metricsServerMap.set("node-1", { metricsURI: "http://localhost:9001" })
    // node-2 has no metrics entry → surfaces as a nodeError with a db-less nodeId.
    clusterNodesRegistry = {
      "cluster-1": {
        "node-1": { host: "127.0.0.1", port: 7000, tls: false, verifyTlsCertificate: false },
        "node-2": { host: "127.0.0.1", port: 7001, tls: false, verifyTlsCertificate: false },
      },
    }
    mockFetch({ nodeId: "node-1", rows: [], count: 0, checkAt: 0 })

    const action = {
      type: VALKEY.COMMANDLOGS.commandLogsRequested,
      payload: { connectionId: "node-1", clusterId: "cluster-1", commandLogType: COMMANDLOG_TYPE.SLOW },
    }

    await commandLogsRequested(deps())(action as any)

    assert.strictEqual(messages.length, 1)
    const sent = JSON.parse(messages[0])
    assert.strictEqual(sent.type, VALKEY.COMMANDLOGS.commandLogsFulfilled)
    assert.strictEqual(sent.payload.clusterId, "cluster-1")
    assert.strictEqual(sent.payload.nodeId, undefined)
    assert.strictEqual(sent.payload.connectionId, undefined)
    assert.ok(Array.isArray(sent.payload.nodeErrors))
    assert.strictEqual(sent.payload.nodeErrors[0].nodeId, "node-2")
    assert.ok(!/-db\d+$/.test(sent.payload.nodeErrors[0].nodeId))
  })
})
