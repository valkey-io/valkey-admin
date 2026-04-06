/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, mock, beforeEach, afterEach } from "node:test"
import assert from "node:assert"
import { VALKEY } from "valkey-common"
import { monitorRequested, saveMonitorSettingsRequested } from "../actions/monitorAction"
import { subscribe, _reset as resetNodeWatchers } from "../node-watchers"

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
  let clusterNodesMap: Map<string, string[]>
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    messages = []
    mockWs = {
      send: mock.fn((msg: string) => messages.push(msg)),
    }
    metricsServerMap = new Map()
    clusterNodesMap = new Map()
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

  const deps = () => ({ ws: mockWs, metricsServerMap, clusterNodesMap, clients: new Map(), connectionId: "" } as any)

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
      assert.strictEqual(sent.payload.connectionId, "conn-1")
      assert.strictEqual(sent.payload.parsedResponse.monitorRunning, false)
      assert.strictEqual(sent.payload.parsedResponse.checkAt, null)
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
      assert.strictEqual(sent.payload.connectionId, "conn-missing")
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
      clusterNodesMap.set("cluster-1", ["node-1", "node-2"])

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
      const sentConnectionIds = [sent1.payload.connectionId, sent2.payload.connectionId].sort()
      assert.deepStrictEqual(sentConnectionIds, ["node-1", "node-2"])
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
      assert.strictEqual(broadcast.payload.connectionId, "conn-1")
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
  })
})

describe("saveMonitorSettingsRequested", () => {
  let mockWs: any
  let messages: string[]
  let metricsServerMap: Map<string, any>
  let clusterNodesMap: Map<string, string[]>
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    messages = []
    mockWs = {
      send: mock.fn((msg: string) => messages.push(msg)),
    }
    metricsServerMap = new Map()
    clusterNodesMap = new Map()
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

  const deps = () => ({ ws: mockWs, metricsServerMap, clusterNodesMap, clients: new Map(), connectionId: "" } as any)

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
    clusterNodesMap.set("cluster-1", ["node-1", "node-2"])

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

    assert.strictEqual(fetchCalls.length, 4)
    // All config messages come before all monitor messages (sequential await)
    const parsed = messages.map((m: string) => JSON.parse(m))
    const configMsgs = parsed.filter((m: any) => m.type === VALKEY.CONFIG.updateConfigFulfilled)
    const monitorMsgs = parsed.filter((m: any) => m.type === VALKEY.MONITOR.monitorFulfilled)
    assert.strictEqual(configMsgs.length, 2)
    assert.strictEqual(monitorMsgs.length, 2)

    // Config messages appear before monitor messages in the messages array
    const firstMonitorIdx = parsed.findIndex((m: any) => m.type === VALKEY.MONITOR.monitorFulfilled)
    assert.ok(firstMonitorIdx >= 2, "all config messages should precede monitor messages")
  })
})
