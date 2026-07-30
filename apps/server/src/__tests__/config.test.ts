/* eslint-disable @typescript-eslint/no-explicit-any */
// Feature: server-side automatic retry with backoff for config updates.
// Tests the config session: automatic retry with live status pushes, the
// supersede rule (a new request aborts the in-flight session for the same
// target), and the not-attempted reply.
import { describe, it, mock, beforeEach, afterEach } from "node:test"
import assert from "node:assert"
import { VALKEY } from "valkey-common"
import { runConfigPushSession } from "../actions/config"
import { ClusterRegistry } from "../metrics-orchestrator"

function createMockResponse(body: any, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  }
}

describe("config actions", () => {
  let mockWs: any
  let messages: string[]
  let metricsServerMap: Map<string, any>
  let connectedNodesByCluster: Map<string, string[]>
  let clusterNodesRegistry: ClusterRegistry
  let clients: Map<string, any>
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    messages = []
    mockWs = {
      // OPEN/readyState so the server's safeSend readyState guard passes.
      OPEN: 1,
      readyState: 1,
      send: mock.fn((msg: string) => messages.push(msg)),
    }
    metricsServerMap = new Map()
    connectedNodesByCluster = new Map()
    clusterNodesRegistry = {}
    clients = new Map()
    // Fast backoff so retry tests run in milliseconds.
    process.env.CONFIG_RETRY_DELAYS_MS = "1,1,1"
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    delete process.env.CONFIG_RETRY_DELAYS_MS
    delete process.env.CONFIG_RETRY_MAX_RETRIES
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
    ws: mockWs, metricsServerMap, connectedNodesByCluster, clients, connectionId: "", clusterNodesRegistry,
  } as any)

  const twoNodeRegistry = (): ClusterRegistry => ({
    "cluster-1": {
      "node-1": { host: "127.0.0.1", port: 7000, tls: false, verifyTlsCertificate: false },
      "node-2": { host: "127.0.0.1", port: 7001, tls: false, verifyTlsCertificate: false },
    },
  })

  // Parsed messages split into live status pushes vs aggregate replies.
  const parsed = () => messages.map((m: string) => JSON.parse(m))
  const statusPushes = () => parsed().filter((m: any) => m.type === VALKEY.CONFIG.updateConfigNodeStatus)
  const aggregateReplies = () => parsed().filter((m: any) => m.type !== VALKEY.CONFIG.updateConfigNodeStatus)

  describe("automatic retry with live status pushes", () => {
    it("retries a failing node, pushing attempting/retrying/succeeded transitions, then one fulfilled reply", async () => {
      clusterNodesRegistry = twoNodeRegistry()
      metricsServerMap.set("node-1", { metricsURI: "http://localhost:9001" })
      metricsServerMap.set("node-2", { metricsURI: "http://localhost:9002" })

      // node-2 fails once, then succeeds; node-1 always succeeds.
      let node2Calls = 0
      globalThis.fetch = (async (url: any) => {
        if (String(url).includes("9002")) {
          node2Calls++
          if (node2Calls === 1) {
            return createMockResponse({ success: false, message: "flaky", data: {} }, false, 500)
          }
        }
        return createMockResponse({ success: true, message: "ok", data: {} })
      }) as any

      const action = {
        type: VALKEY.CONFIG.updateConfig,
        payload: { connectionId: "node-1", clusterId: "cluster-1", config: { epic: { name: "monitor" } } },
      }

      await runConfigPushSession(deps())(action as any)

      // node-2's status trail shows the retry cycle.
      const node2Statuses = statusPushes()
        .filter((m: any) => m.payload.nodeId === "node-2")
        .map((m: any) => `${m.payload.status}@${m.payload.attempt}`)
      assert.deepStrictEqual(node2Statuses, ["attempting@1", "retrying@1", "attempting@2", "succeeded@2"])

      // Every push carries the cluster target arm.
      for (const push of statusPushes()) {
        assert.strictEqual(push.payload.clusterId, "cluster-1")
      }

      // Exactly one aggregate reply, fulfilled, once the session resolves.
      const sent = aggregateReplies()
      assert.strictEqual(sent.length, 1)
      assert.strictEqual(sent[0].type, VALKEY.CONFIG.updateConfigFulfilled)
      assert.strictEqual(node2Calls, 2)
    })

    it("caps retries and sends a failed reply when a node never recovers", async () => {
      process.env.CONFIG_RETRY_MAX_RETRIES = "2"
      clusterNodesRegistry = twoNodeRegistry()
      metricsServerMap.set("node-1", { metricsURI: "http://localhost:9001" })
      metricsServerMap.set("node-2", { metricsURI: "http://localhost:9002" })

      let node2Calls = 0
      globalThis.fetch = (async (url: any) => {
        if (String(url).includes("9002")) {
          node2Calls++
          return createMockResponse({ success: false, message: "down", data: {} }, false, 500)
        }
        return createMockResponse({ success: true, message: "ok", data: {} })
      }) as any

      const action = {
        type: VALKEY.CONFIG.updateConfig,
        payload: { connectionId: "node-1", clusterId: "cluster-1", config: { epic: { name: "monitor" } } },
      }

      await runConfigPushSession(deps())(action as any)

      // Hard cap honored: initial attempt + 2 retries.
      assert.strictEqual(node2Calls, 3)

      const node2Last = statusPushes().filter((m: any) => m.payload.nodeId === "node-2").pop()
      assert.strictEqual(node2Last.payload.status, "failed")

      const sent = aggregateReplies()
      assert.strictEqual(sent.length, 1)
      assert.strictEqual(sent[0].type, VALKEY.CONFIG.updateConfigFailed)
      const node2Result = sent[0].payload.nodeResults.find((r: any) => r.nodeId === "node-2")
      assert.strictEqual(node2Result.success, false)
      // The failed reply is PARTIAL here (node-1 succeeded), so it still
      // carries the applied config: node-1 DID apply it and the frontend
      // shows it.
      assert.deepStrictEqual(sent[0].payload.appliedConfig, { epic: { name: "monitor" } })
    })

    it("omits appliedConfig from a total-failure reply (no node applied it)", async () => {
      process.env.CONFIG_RETRY_MAX_RETRIES = "0"
      clusterNodesRegistry = twoNodeRegistry()
      metricsServerMap.set("node-1", { metricsURI: "http://localhost:9001" })
      metricsServerMap.set("node-2", { metricsURI: "http://localhost:9002" })
      mockFetch({ success: false, message: "down", data: {} }, false, 500)

      const action = {
        type: VALKEY.CONFIG.updateConfig,
        payload: { connectionId: "node-1", clusterId: "cluster-1", config: { epic: { name: "monitor" } } },
      }

      await runConfigPushSession(deps())(action as any)

      const sent = aggregateReplies()
      assert.strictEqual(sent.length, 1)
      assert.strictEqual(sent[0].type, VALKEY.CONFIG.updateConfigFailed)
      assert.strictEqual(sent[0].payload.appliedConfig, undefined)
    })

    it("a new request for the same target aborts the in-flight session and only the new session replies", async () => {
      process.env.CONFIG_RETRY_DELAYS_MS = "60000" // first session parks in a long backoff
      clusterNodesRegistry = twoNodeRegistry()
      metricsServerMap.set("node-1", { metricsURI: "http://localhost:9001" })
      metricsServerMap.set("node-2", { metricsURI: "http://localhost:9002" })

      // First session: node-2 fails (entering the 60s backoff). Second
      // session: everything succeeds.
      let phase = 1
      globalThis.fetch = (async (url: any) => {
        if (phase === 1 && String(url).includes("9002")) {
          return createMockResponse({ success: false, message: "down", data: {} }, false, 500)
        }
        return createMockResponse({ success: true, message: "ok", data: {} })
      }) as any

      const makeAction = () => ({
        type: VALKEY.CONFIG.updateConfig,
        payload: { connectionId: "node-1", clusterId: "cluster-1", config: { epic: { name: "monitor" } } },
      })

      const first = runConfigPushSession(deps())(makeAction() as any)
      // Wait until the first session has demonstrably parked in the backoff
      // (its `retrying` push for node-2 has been sent) — not a fixed sleep,
      // which races the session's first attempts on a slow machine.
      const firstParked = () => statusPushes().some(
        (m: any) => m.payload.nodeId === "node-2" && m.payload.status === "retrying",
      )
      while (!firstParked()) {
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
      const pushCountAtSupersede = statusPushes().length

      phase = 2
      await runConfigPushSession(deps())(makeAction() as any)
      // The aborted first session resolves promptly (not after 60s).
      await first

      // Exactly ONE aggregate reply: the superseded session's is suppressed.
      const sent = aggregateReplies()
      assert.strictEqual(sent.length, 1)
      assert.strictEqual(sent[0].type, VALKEY.CONFIG.updateConfigFulfilled)

      // The superseded session went SILENT after the abort: every push past
      // the supersede point belongs to the second session (which succeeds on
      // attempt 1, so no further `retrying` for node-2 may appear).
      const pushesAfterSupersede = statusPushes().slice(pushCountAtSupersede)
      assert.ok(pushesAfterSupersede.length > 0, "second session emitted pushes")
      for (const push of pushesAfterSupersede) {
        assert.notStrictEqual(
          push.payload.status,
          "retrying",
          "a push after the supersede can only come from the (all-success) second session",
        )
      }
    })
  })

  describe("cluster not-attempted reply (Req 1.5)", () => {
    it("sends a distinct not_attempted outcome listing every node when no metrics process is registered", async () => {
      clusterNodesRegistry = twoNodeRegistry()
      // metricsServerMap left empty: no node has a registered metrics process.
      const fetchCalls = mockFetch({ success: true, message: "ok", data: {} })

      const action = {
        type: VALKEY.CONFIG.updateConfig,
        payload: { connectionId: "node-1", clusterId: "cluster-1", config: { epic: { name: "monitor" } } },
      }

      await runConfigPushSession(deps())(action as any)

      assert.strictEqual(fetchCalls.length, 0)
      // One not_attempted status push per node, plus the aggregate reply.
      const pushes = statusPushes()
      assert.deepStrictEqual(pushes.map((m: any) => m.payload.status), ["not_attempted", "not_attempted"])
      const sent = aggregateReplies()
      assert.strictEqual(sent.length, 1)
      assert.strictEqual(sent[0].type, VALKEY.CONFIG.updateConfigFailed)
      assert.strictEqual(sent[0].payload.outcome, "not_attempted")
      assert.deepStrictEqual(sent[0].payload.nodeResults, [])
      assert.deepStrictEqual(sent[0].payload.notAttemptedNodeIds.sort(), ["node-1", "node-2"])
    })
  })
})
