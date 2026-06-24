/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, mock, beforeEach, afterEach } from "node:test"
import assert from "node:assert"
import { VALKEY } from "valkey-common"
import { monitorRequested, saveMonitorSettingsRequested } from "../actions/monitorAction"
import { subscribe, _reset as resetNodeWatchers } from "../node-watchers"
import { ClusterRegistry } from "../metrics-orchestrator"

function createMockResponse(body: any, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  }
}

describe("monitorAction", () => {
  let mockWs: any
  let messages: string[]
  let metricsServerMap: Map<string, any>
  let connectedNodesByCluster: Map<string, string[]>
  let clusterNodesRegistry: ClusterRegistry 
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    messages = []
    mockWs = {
      send: mock.fn((msg: string) => messages.push(msg)),
    }
    metricsServerMap = new Map()
    connectedNodesByCluster = new Map()
    clusterNodesRegistry = {}
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    resetNodeWatchers()
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

  describe("status request", () => {
    it("should call GET /monitor?action=status and send monitorFulfilled", async () => {
      metricsServerMap.set("conn-1", { metricsURI: "http://localhost:9999" })
      const fetchCalls = mockFetch({ monitorRunning: false, checkAt: null })

      const action = {
        type: VALKEY.MONITOR.monitorRequested,
        payload: { connectionId: "conn-1", monitorAction: "status" },
      }

      await monitorRequested(deps())(action as any)

      assert.strictEqual(fetchCalls.length, 1)
      assert.ok(fetchCalls[0].includes("/monitor?action=status"))

      assert.strictEqual(messages.length, 1)
      const sent = JSON.parse(messages[0])
      assert.strictEqual(sent.type, VALKEY.MONITOR.monitorFulfilled)
      // Standalone monitor replies carry a db-less { nodeId }.
      assert.strictEqual(sent.payload.nodeId, "conn-1")
      assert.strictEqual(sent.payload.connectionId, undefined)
      assert.strictEqual(sent.payload.parsedResponse.monitorRunning, false)
      assert.strictEqual(sent.payload.parsedResponse.checkAt, null)
    })
  })

  describe("standalone db normalization", () => {
    it("keys the reply by the db-less nodeId and looks up metrics by the db-less node id", async () => {
      // metricsServerMap is keyed db-less; the payload connectionId is db-suffixed.
      metricsServerMap.set("host-6379", { metricsURI: "http://localhost:9999" })
      const fetchCalls = mockFetch({ monitorRunning: true, checkAt: 123 })

      const action = {
        type: VALKEY.MONITOR.monitorRequested,
        payload: { connectionId: "host-6379-db2", monitorAction: "status" },
      }

      await monitorRequested(deps())(action as any)

      // Looked up the db-less metrics entry.
      assert.strictEqual(fetchCalls.length, 1)
      assert.ok(fetchCalls[0].includes("localhost:9999/monitor?action=status"))

      // Monitor state is node-level: the reply carries the db-less nodeId
      // (the `-db2` suffix is stripped), never the db-suffixed connectionId.
      assert.strictEqual(messages.length, 1)
      const sent = JSON.parse(messages[0])
      assert.strictEqual(sent.type, VALKEY.MONITOR.monitorFulfilled)
      assert.strictEqual(sent.payload.nodeId, "host-6379")
      assert.strictEqual(sent.payload.connectionId, undefined)
      assert.strictEqual(sent.payload.clusterId, undefined)
    })
  })

  describe("start request", () => {
    it("should call GET /monitor?action=start and send monitorFulfilled", async () => {
      metricsServerMap.set("conn-1", { metricsURI: "http://localhost:9999" })
      const fetchCalls = mockFetch({ monitorRunning: true, checkAt: 12345 })

      const action = {
        type: VALKEY.MONITOR.monitorRequested,
        payload: { connectionId: "conn-1", monitorAction: "start" },
      }

      await monitorRequested(deps())(action as any)

      assert.ok(fetchCalls[0].includes("/monitor?action=start"))

      const sent = JSON.parse(messages[0])
      assert.strictEqual(sent.type, VALKEY.MONITOR.monitorFulfilled)
      assert.strictEqual(sent.payload.parsedResponse.monitorRunning, true)
      assert.strictEqual(sent.payload.parsedResponse.checkAt, 12345)
    })
  })

  describe("stop request", () => {
    it("should call GET /monitor?action=stop and send monitorFulfilled", async () => {
      metricsServerMap.set("conn-1", { metricsURI: "http://localhost:9999" })
      const fetchCalls = mockFetch({ monitorRunning: false, checkAt: null })

      const action = {
        type: VALKEY.MONITOR.monitorRequested,
        payload: { connectionId: "conn-1", monitorAction: "stop" },
      }

      await monitorRequested(deps())(action as any)

      assert.ok(fetchCalls[0].includes("/monitor?action=stop"))

      const sent = JSON.parse(messages[0])
      assert.strictEqual(sent.type, VALKEY.MONITOR.monitorFulfilled)
      assert.strictEqual(sent.payload.parsedResponse.monitorRunning, false)
    })
  })

  describe("error: metrics URI not found", () => {
    it("should send monitorError when metricsServerMap has no entry", async () => {
      const action = {
        type: VALKEY.MONITOR.monitorRequested,
        payload: { connectionId: "conn-missing", monitorAction: "status" },
      }

      await monitorRequested(deps())(action as any)

      assert.strictEqual(messages.length, 1)
      const sent = JSON.parse(messages[0])
      assert.strictEqual(sent.type, VALKEY.MONITOR.monitorError)
      // Standalone monitor errors are keyed by the db-less nodeId.
      assert.strictEqual(sent.payload.nodeId, "conn-missing")
      assert.strictEqual(sent.payload.connectionId, undefined)
      assert.strictEqual(sent.payload.error, "Metrics server URI not found")
    })
  })

  describe("error: HTTP 500 from metrics", () => {
    it("should send monitorError with error message from response body", async () => {
      metricsServerMap.set("conn-1", { metricsURI: "http://localhost:9999" })
      mockFetch({ error: "monitor already stopped" }, false, 500)

      const action = {
        type: VALKEY.MONITOR.monitorRequested,
        payload: { connectionId: "conn-1", monitorAction: "stop" },
      }

      await monitorRequested(deps())(action as any)

      const sent = JSON.parse(messages[0])
      assert.strictEqual(sent.type, VALKEY.MONITOR.monitorError)
      assert.strictEqual(sent.payload.error, "monitor already stopped")
    })
  })

  describe("error: fetch throws", () => {
    it("should send monitorError when fetch rejects", async () => {
      metricsServerMap.set("conn-1", { metricsURI: "http://localhost:9999" })
      mockFetchThrow(new Error("network timeout"))

      const action = {
        type: VALKEY.MONITOR.monitorRequested,
        payload: { connectionId: "conn-1", monitorAction: "start" },
      }

      await monitorRequested(deps())(action as any)

      const sent = JSON.parse(messages[0])
      assert.strictEqual(sent.type, VALKEY.MONITOR.monitorError)
      assert.strictEqual(sent.payload.error, "network timeout")
    })
  })

  describe("cluster fan-out", () => {
    it("should send requests to all cluster nodes", async () => {
      metricsServerMap.set("node-1", { metricsURI: "http://localhost:9001" })
      metricsServerMap.set("node-2", { metricsURI: "http://localhost:9002" })
      clusterNodesRegistry = {
        "cluster-1": {
          "node-1": {
            host: "127.0.0.1",
            port: 7000,
            tls: false,
            verifyTlsCertificate: false,
          },
          "node-2": {
            host: "127.0.0.1",
            port: 7001,
            tls: false,
            verifyTlsCertificate: false,
          },
        },
      }

      const fetchCalls = mockFetch({ monitorRunning: true, checkAt: 55555 })

      const action = {
        type: VALKEY.MONITOR.monitorRequested,
        payload: { connectionId: "node-1", clusterId: "cluster-1", monitorAction: "status" },
      }

      await monitorRequested(deps())(action as any)

      assert.strictEqual(fetchCalls.length, 2)
      assert.ok(fetchCalls.some((u: string) => u.includes("localhost:9001/monitor?action=status")))
      assert.ok(fetchCalls.some((u: string) => u.includes("localhost:9002/monitor?action=status")))

      assert.strictEqual(messages.length, 2)
      const sent1 = JSON.parse(messages[0])
      const sent2 = JSON.parse(messages[1])
      assert.strictEqual(sent1.type, VALKEY.MONITOR.monitorFulfilled)
      assert.strictEqual(sent2.type, VALKEY.MONITOR.monitorFulfilled)
      // Cluster replies carry { clusterId, nodeId } (db-less nodeId), not connectionId.
      assert.strictEqual(sent1.payload.connectionId, undefined)
      assert.strictEqual(sent1.payload.clusterId, "cluster-1")
      assert.strictEqual(sent2.payload.clusterId, "cluster-1")
      const sentNodeIds = [sent1.payload.nodeId, sent2.payload.nodeId].sort()
      assert.deepStrictEqual(sentNodeIds, ["node-1", "node-2"])
    })
  })

  describe("broadcast to other watchers", () => {
    it("should broadcast monitorFulfilled to other watchers on start", async () => {
      metricsServerMap.set("conn-1", { metricsURI: "http://localhost:9999" })
      mockFetch({ monitorRunning: true, checkAt: 12345 })

      const watcherMessages: string[] = []
      const otherWs: any = { send: mock.fn((msg: string) => watcherMessages.push(msg)) }

      // Both ws clients watch the same node
      subscribe("conn-1", mockWs)
      subscribe("conn-1", otherWs)

      const action = {
        type: VALKEY.MONITOR.monitorRequested,
        payload: { connectionId: "conn-1", monitorAction: "start" },
      }

      await monitorRequested(deps())(action as any)

      // Originator gets the message
      assert.strictEqual(messages.length, 1)
      const sent = JSON.parse(messages[0])
      assert.strictEqual(sent.type, VALKEY.MONITOR.monitorFulfilled)

      // Other watcher gets the broadcast
      assert.strictEqual(watcherMessages.length, 1)
      const broadcast = JSON.parse(watcherMessages[0])
      assert.strictEqual(broadcast.type, VALKEY.MONITOR.monitorFulfilled)
      // Broadcast reply is node-keyed (db-less nodeId), not connectionId.
      assert.strictEqual(broadcast.payload.nodeId, "conn-1")
      assert.strictEqual(broadcast.payload.connectionId, undefined)
      assert.strictEqual(broadcast.payload.parsedResponse.monitorRunning, true)
    })

    it("should broadcast monitorFulfilled to other watchers on stop", async () => {
      metricsServerMap.set("conn-1", { metricsURI: "http://localhost:9999" })
      mockFetch({ monitorRunning: false, checkAt: null })

      const watcherMessages: string[] = []
      const otherWs: any = { send: mock.fn((msg: string) => watcherMessages.push(msg)) }

      subscribe("conn-1", mockWs)
      subscribe("conn-1", otherWs)

      const action = {
        type: VALKEY.MONITOR.monitorRequested,
        payload: { connectionId: "conn-1", monitorAction: "stop" },
      }

      await monitorRequested(deps())(action as any)

      assert.strictEqual(watcherMessages.length, 1)
      const broadcast = JSON.parse(watcherMessages[0])
      assert.strictEqual(broadcast.type, VALKEY.MONITOR.monitorFulfilled)
      assert.strictEqual(broadcast.payload.parsedResponse.monitorRunning, false)
    })

    it("should NOT broadcast on status request", async () => {
      metricsServerMap.set("conn-1", { metricsURI: "http://localhost:9999" })
      mockFetch({ monitorRunning: true, checkAt: 12345 })

      const watcherMessages: string[] = []
      const otherWs: any = { send: mock.fn((msg: string) => watcherMessages.push(msg)) }

      subscribe("conn-1", mockWs)
      subscribe("conn-1", otherWs)

      const action = {
        type: VALKEY.MONITOR.monitorRequested,
        payload: { connectionId: "conn-1", monitorAction: "status" },
      }

      await monitorRequested(deps())(action as any)

      // Originator gets the message
      assert.strictEqual(messages.length, 1)
      // Other watcher should NOT get a broadcast
      assert.strictEqual(watcherMessages.length, 0)
    })

    it("should exclude the originator from broadcast", async () => {
      metricsServerMap.set("conn-1", { metricsURI: "http://localhost:9999" })
      mockFetch({ monitorRunning: true, checkAt: 12345 })

      // Only the originator is watching
      subscribe("conn-1", mockWs)

      const action = {
        type: VALKEY.MONITOR.monitorRequested,
        payload: { connectionId: "conn-1", monitorAction: "start" },
      }

      await monitorRequested(deps())(action as any)

      // Only one message to originator, no extra broadcast
      assert.strictEqual(messages.length, 1)
    })

    it("looks up other watchers by the db-suffixed connectionId while replying with a db-less nodeId", async () => {
      // Metrics is keyed db-less; watcher subscriptions stay keyed by the
      // db-suffixed connectionId (Req 6.5). The reply payload is node-level.
      metricsServerMap.set("host-6379", { metricsURI: "http://localhost:9999" })
      mockFetch({ monitorRunning: true, checkAt: 12345 })

      const watcherMessages: string[] = []
      const otherWs: any = { send: mock.fn((msg: string) => watcherMessages.push(msg)) }

      // Both clients subscribe under the db-suffixed connectionId.
      subscribe("host-6379-db2", mockWs)
      subscribe("host-6379-db2", otherWs)

      const action = {
        type: VALKEY.MONITOR.monitorRequested,
        payload: { connectionId: "host-6379-db2", monitorAction: "start" },
      }

      await monitorRequested(deps())(action as any)

      // getOtherWatchers resolved the db-suffixed connectionId, so the other
      // watcher (subscribed under "host-6379-db2") received the broadcast.
      assert.strictEqual(watcherMessages.length, 1)
      const broadcast = JSON.parse(watcherMessages[0])
      assert.strictEqual(broadcast.type, VALKEY.MONITOR.monitorFulfilled)
      // ...but the reply payload itself is keyed by the db-less nodeId.
      assert.strictEqual(broadcast.payload.nodeId, "host-6379")
      assert.strictEqual(broadcast.payload.connectionId, undefined)
    })
  })
})

describe("saveMonitorSettingsRequested", () => {
  let mockWs: any
  let messages: string[]
  let metricsServerMap: Map<string, any>
  let connectedNodesByCluster: Map<string, string[]>
  let clusterNodesRegistry: ClusterRegistry
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    messages = []
    mockWs = {
      send: mock.fn((msg: string) => messages.push(msg)),
    }
    metricsServerMap = new Map()
    connectedNodesByCluster = new Map()
    clusterNodesRegistry = {}
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    resetNodeWatchers()
  })

  function mockFetchRouted(routes: Record<string, { body: any; ok?: boolean; status?: number }>) {
    const fetchCalls: string[] = []
    globalThis.fetch = (async (url: any) => {
      const urlStr = String(url)
      fetchCalls.push(urlStr)
      for (const [pattern, resp] of Object.entries(routes)) {
        if (urlStr.includes(pattern)) {
          return createMockResponse(resp.body, resp.ok ?? true, resp.status ?? 200)
        }
      }
      return createMockResponse({ error: "unmatched route" }, false, 404)
    }) as any
    return fetchCalls
  }

  const deps = () => ({ 
    ws: mockWs, metricsServerMap, connectedNodesByCluster, clients: new Map(), connectionId: "", clusterNodesRegistry, 
  } as any)

  it("should call only updateConfig when config is present but monitorAction is absent", async () => {
    metricsServerMap.set("conn-1", { metricsURI: "http://localhost:9999" })
    const fetchCalls = mockFetchRouted({
      "/update-config": { body: { success: true, message: "", data: {} } },
    })

    const action = {
      type: VALKEY.MONITOR.saveMonitorSettingsRequested,
      payload: { connectionId: "conn-1", config: { epic: { name: "monitor" } } },
      meta: undefined,
    }

    await saveMonitorSettingsRequested(deps())(action as any)

    assert.strictEqual(fetchCalls.length, 1)
    assert.ok(fetchCalls[0].includes("/update-config"))

    assert.strictEqual(messages.length, 1)
    const sent = JSON.parse(messages[0])
    assert.strictEqual(sent.type, VALKEY.CONFIG.updateConfigFulfilled)
  })

  it("should call only monitorRequested when monitorAction is present but config is absent", async () => {
    metricsServerMap.set("conn-1", { metricsURI: "http://localhost:9999" })
    const fetchCalls = mockFetchRouted({
      "/monitor": { body: { monitorRunning: true, checkAt: 12345 } },
    })

    const action = {
      type: VALKEY.MONITOR.saveMonitorSettingsRequested,
      payload: { connectionId: "conn-1", monitorAction: "start" },
      meta: undefined,
    }

    await saveMonitorSettingsRequested(deps())(action as any)

    assert.strictEqual(fetchCalls.length, 1)
    assert.ok(fetchCalls[0].includes("/monitor?action=start"))

    assert.strictEqual(messages.length, 1)
    const sent = JSON.parse(messages[0])
    assert.strictEqual(sent.type, VALKEY.MONITOR.monitorFulfilled)
    assert.strictEqual(sent.payload.parsedResponse.monitorRunning, true)
  })

  it("should call both updateConfig then monitorRequested when both are present", async () => {
    metricsServerMap.set("conn-1", { metricsURI: "http://localhost:9999" })
    const fetchCalls = mockFetchRouted({
      "/update-config": { body: { success: true, message: "", data: {} } },
      "/monitor": { body: { monitorRunning: true, checkAt: 99999 } },
    })

    const action = {
      type: VALKEY.MONITOR.saveMonitorSettingsRequested,
      payload: { connectionId: "conn-1", config: { epic: { name: "monitor" } }, monitorAction: "start" },
      meta: undefined,
    }

    await saveMonitorSettingsRequested(deps())(action as any)

    assert.strictEqual(fetchCalls.length, 2)
    assert.ok(fetchCalls[0].includes("/update-config"))
    assert.ok(fetchCalls[1].includes("/monitor?action=start"))

    assert.strictEqual(messages.length, 2)
    const configMsg = JSON.parse(messages[0])
    const monitorMsg = JSON.parse(messages[1])
    assert.strictEqual(configMsg.type, VALKEY.CONFIG.updateConfigFulfilled)
    assert.strictEqual(monitorMsg.type, VALKEY.MONITOR.monitorFulfilled)
  })

  it("should send no messages when neither config nor monitorAction is present", async () => {
    metricsServerMap.set("conn-1", { metricsURI: "http://localhost:9999" })

    const action = {
      type: VALKEY.MONITOR.saveMonitorSettingsRequested,
      payload: { connectionId: "conn-1" },
      meta: undefined,
    }

    await saveMonitorSettingsRequested(deps())(action as any)

    assert.strictEqual(messages.length, 0)
  })

  it("should still call monitorRequested when config update fails", async () => {
    metricsServerMap.set("conn-1", { metricsURI: "http://localhost:9999" })
    const fetchCalls = mockFetchRouted({
      "/update-config": { body: { success: false, message: "bad config", data: {} }, ok: false, status: 400 },
      "/monitor": { body: { monitorRunning: true, checkAt: 11111 } },
    })

    const action = {
      type: VALKEY.MONITOR.saveMonitorSettingsRequested,
      payload: { connectionId: "conn-1", config: { epic: { name: "monitor" } }, monitorAction: "start" },
      meta: undefined,
    }

    await saveMonitorSettingsRequested(deps())(action as any)

    assert.strictEqual(fetchCalls.length, 2)

    assert.strictEqual(messages.length, 2)
    const configMsg = JSON.parse(messages[0])
    const monitorMsg = JSON.parse(messages[1])
    assert.strictEqual(configMsg.type, VALKEY.CONFIG.updateConfigFailed)
    assert.strictEqual(monitorMsg.type, VALKEY.MONITOR.monitorFulfilled)
    assert.strictEqual(monitorMsg.payload.parsedResponse.monitorRunning, true)
  })

  it("should fan out across cluster nodes for both config and monitor", async () => {
    metricsServerMap.set("node-1", { metricsURI: "http://localhost:9001" })
    metricsServerMap.set("node-2", { metricsURI: "http://localhost:9002" })
    clusterNodesRegistry = {
      "cluster-1": {
        "node-1": {
          host: "127.0.0.1",
          port: 7000,
          tls: false,
          verifyTlsCertificate: false,
        },
        "node-2": {
          host: "127.0.0.1",
          port: 7001,
          tls: false,
          verifyTlsCertificate: false,
        },
      },
    }
    const fetchCalls = mockFetchRouted({
      "/update-config": { body: { success: true, message: "", data: {} } },
      "/monitor": { body: { monitorRunning: true, checkAt: 55555 } },
    })

    const action = {
      type: VALKEY.MONITOR.saveMonitorSettingsRequested,
      payload: { connectionId: "node-1", clusterId: "cluster-1", config: { epic: { name: "monitor" } }, monitorAction: "start" },
      meta: undefined,
    }

    await saveMonitorSettingsRequested(deps())(action as any)

    // Config: one POST per node (2) + one aggregated reply; monitor: 2 POSTs + 2 replies.
    assert.strictEqual(fetchCalls.length, 4)
    const parsed = messages.map((m: string) => JSON.parse(m))
    const configMsgs = parsed.filter((m: any) => m.type === VALKEY.CONFIG.updateConfigFulfilled)
    const monitorMsgs = parsed.filter((m: any) => m.type === VALKEY.MONITOR.monitorFulfilled)
    // Config aggregates the cluster fan-out into ONE cluster-keyed reply.
    assert.strictEqual(configMsgs.length, 1)
    assert.strictEqual(configMsgs[0].payload.clusterId, "cluster-1")
    assert.strictEqual(configMsgs[0].payload.connectionId, undefined)
    // Monitor remains per-node (2 replies).
    assert.strictEqual(monitorMsgs.length, 2)

    // The aggregated config message precedes the monitor messages (config awaited first)
    const firstMonitorIdx = parsed.findIndex((m: any) => m.type === VALKEY.MONITOR.monitorFulfilled)
    const configIdx = parsed.findIndex((m: any) => m.type === VALKEY.CONFIG.updateConfigFulfilled)
    assert.ok(configIdx < firstMonitorIdx, "config message should precede monitor messages")
  })

  it("aggregates cluster config to one failure reply when a node fails (first error)", async () => {
    metricsServerMap.set("node-1", { metricsURI: "http://localhost:9001" })
    metricsServerMap.set("node-2", { metricsURI: "http://localhost:9002" })
    clusterNodesRegistry = {
      "cluster-1": {
        "node-1": { host: "127.0.0.1", port: 7000, tls: false, verifyTlsCertificate: false },
        "node-2": { host: "127.0.0.1", port: 7001, tls: false, verifyTlsCertificate: false },
      },
    }
    // node-2 (9002) fails; node-1 succeeds.
    globalThis.fetch = (async (url: any) => {
      const urlStr = String(url)
      if (urlStr.includes("9002")) {
        return createMockResponse({ success: false, message: "bad config", data: {} }, false, 400)
      }
      return createMockResponse({ success: true, message: "", data: {} })
    }) as any

    const action = {
      type: VALKEY.MONITOR.saveMonitorSettingsRequested,
      payload: { connectionId: "node-1", clusterId: "cluster-1", config: { epic: { name: "monitor" } } },
      meta: undefined,
    }

    await saveMonitorSettingsRequested(deps())(action as any)

    // One aggregated reply, keyed by clusterId, surfacing the failure.
    assert.strictEqual(messages.length, 1)
    const sent = JSON.parse(messages[0])
    assert.strictEqual(sent.type, VALKEY.CONFIG.updateConfigFailed)
    assert.strictEqual(sent.payload.clusterId, "cluster-1")
    assert.strictEqual(sent.payload.connectionId, undefined)
  })

  it("keys a standalone config reply by the db-less nodeId", async () => {
    metricsServerMap.set("host-6379", { metricsURI: "http://localhost:9999" })
    mockFetchRouted({ "/update-config": { body: { success: true, message: "", data: {} } } })

    const action = {
      type: VALKEY.MONITOR.saveMonitorSettingsRequested,
      payload: { connectionId: "host-6379-db0", config: { epic: { name: "monitor" } } },
      meta: undefined,
    }

    await saveMonitorSettingsRequested(deps())(action as any)

    assert.strictEqual(messages.length, 1)
    const sent = JSON.parse(messages[0])
    assert.strictEqual(sent.type, VALKEY.CONFIG.updateConfigFulfilled)
    // Config is node-level: reply carries the db-stripped nodeId, not the connectionId.
    assert.strictEqual(sent.payload.nodeId, "host-6379")
    assert.strictEqual(sent.payload.connectionId, undefined)
    assert.strictEqual(sent.payload.clusterId, undefined)
  })
})
