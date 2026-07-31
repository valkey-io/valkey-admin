import { describe, it, expect } from "vitest"
import configReducer, {
  setConfig,
  updateConfig,
  updateConfigNodeStatus,
  updateConfigFulfilled,
  updateConfigFailed,
  selectConfig
} from "./configSlice"

describe("configSlice", () => {
  const initialState = {}

  describe("setConfig (seed on connect)", () => {
    it("keys standalone config by the db-less nodeId", () => {
      const state = configReducer(
        initialState,
        setConfig({
          connectionId: "host-6379-db0",
          connectionDetails: {},
        }),
      )

      // Seeded under the db-less nodeId, not the db-suffixed connectionId.
      expect(state["host-6379"]).toBeDefined()
      expect(state["host-6379-db0"]).toBeUndefined()
    })

    it("collapses two connections to the same node on different dbs into one entry", () => {
      const afterDb0 = configReducer(
        initialState,
        setConfig({ connectionId: "host-6379-db0", connectionDetails: {} }),
      )
      const afterDb1 = configReducer(
        afterDb0,
        setConfig({ connectionId: "host-6379-db1", connectionDetails: {} }),
      )

      expect(Object.keys(afterDb1)).toEqual(["host-6379"])
    })

    it("keys cluster config by clusterId (nested in connectionDetails)", () => {
      const state = configReducer(
        initialState,
        setConfig({
          connectionId: "node-1-db0",
          connectionDetails: { clusterId: "cluster-1" },
        }),
      )

      // Seeded under clusterId, NOT the db-suffixed connectionId.
      expect(state["cluster-1"]).toBeDefined()
      expect(state["node-1-db0"]).toBeUndefined()
    })

    it("seeds only the config entry fields (no dead fields)", () => {
      const state = configReducer(
        initialState,
        setConfig({ connectionId: "host-6379-db0", connectionDetails: {} }),
      )

      const entry = state["host-6379"]
      // ConfigEntry shape carries monitoring/status/errorMessage plus the
      // live per-node status fields for the server-side retry session.
      expect(Object.keys(entry).sort()).toEqual(
        [
          "errorMessage", "kind", "monitoring", "nodeStatuses",
          "notAttemptedNodeIds", "status", "succeededCount",
        ],
      )
      expect(Object.keys(entry.monitoring).sort()).toEqual(
        ["cutoffFrequency", "maxCommandsPerRun", "monitoringDuration", "monitoringInterval"],
      )
      // Removed dead fields are not present.
      expect(entry).not.toHaveProperty("darkMode")
      expect(entry).not.toHaveProperty("keyEvictionPolicy")
      expect(entry).not.toHaveProperty("clusterSlotStatsEnabled")
    })

    it("does not copy connection details into config state", () => {
      const state = configReducer(
        initialState,
        setConfig({
          connectionId: "host-6379-db0",
          connectionDetails: { keyEvictionPolicy: "allkeys-lfu", clusterSlotStatsEnabled: true },
        }),
      )

      const entry = state["host-6379"]
      expect(entry).not.toHaveProperty("keyEvictionPolicy")
      expect(entry).not.toHaveProperty("clusterSlotStatsEnabled")
    })
  })

  describe("updateConfigFulfilled (server reply)", () => {
    it("applies monitoring settings on the cluster entry (keyed by clusterId)", () => {
      const seeded = configReducer(
        initialState,
        setConfig({
          connectionId: "node-1-db0",
          connectionDetails: { clusterId: "cluster-1" },
        }),
      )

      const state = configReducer(
        seeded,
        updateConfigFulfilled({
          clusterId: "cluster-1",
          outcome: "fulfilled",
          nodeResults: [{ nodeId: "node-1", success: true, message: "ok" }],
          appliedConfig: { epic: { name: "monitor", monitoringDuration: 5000, monitoringInterval: 7000 } },
        }),
      )

      // Initial seed and post-update land on the SAME cluster-keyed entry.
      expect(state["cluster-1"].monitoring.monitoringDuration).toBe(5000)
      expect(state["cluster-1"].monitoring.monitoringInterval).toBe(7000)
      expect(state["cluster-1"].status).toBe("updated")
    })

    it("applies standalone monitoring settings keyed by nodeId", () => {
      const state = configReducer(
        initialState,
        updateConfigFulfilled({
          nodeId: "host-6379",
          outcome: "fulfilled",
          nodeResults: [{ nodeId: "host-6379", success: true, message: "ok" }],
          appliedConfig: { epic: { name: "monitor", monitoringDuration: 1234 } },
        }),
      )

      expect(state["host-6379"].monitoring.monitoringDuration).toBe(1234)
    })
  })

  describe("updateConfigFailed", () => {
    it("sets failed status and reconciles every failed node's status on the cluster entry", () => {
      const state = configReducer(
        initialState,
        updateConfigFailed({
          clusterId: "cluster-1",
          outcome: "failed",
          nodeResults: [
            { nodeId: "node-1", success: false, message: "bad config" },
            { nodeId: "node-2", success: false, message: "also bad" },
          ],
        }),
      )

      expect(state["cluster-1"].status).toBe("failed")
      expect(state["cluster-1"].nodeStatuses["node-1"].status).toBe("failed")
      expect(state["cluster-1"].nodeStatuses["node-2"].status).toBe("failed")
      expect(state["cluster-1"].errorMessage).toBe("bad config")
    })

    it("applies monitoring settings on a partial failure (succeeded nodes run with them)", () => {
      const state = configReducer(
        initialState,
        updateConfigFailed({
          clusterId: "cluster-1",
          outcome: "failed",
          nodeResults: [
            { nodeId: "node-1", success: true, message: "ok" },
            { nodeId: "node-2", success: false, message: "boom" },
          ],
          appliedConfig: { epic: { name: "monitor", monitoringDuration: 5000, monitoringInterval: 7000 } },
        }),
      )

      expect(state["cluster-1"].status).toBe("partial")
      expect(state["cluster-1"].monitoring.monitoringDuration).toBe(5000)
      expect(state["cluster-1"].monitoring.monitoringInterval).toBe(7000)
    })

    it("keeps the previous monitoring settings on a total failure", () => {
      const seeded = configReducer(
        initialState,
        setConfig({ connectionId: "node-1-db0", connectionDetails: { clusterId: "cluster-1" } }),
      )
      const previousDuration = seeded["cluster-1"].monitoring.monitoringDuration

      const state = configReducer(
        seeded,
        updateConfigFailed({
          clusterId: "cluster-1",
          outcome: "failed",
          nodeResults: [
            { nodeId: "node-1", success: false, message: "boom" },
            { nodeId: "node-2", success: false, message: "also boom" },
          ],
          appliedConfig: { epic: { name: "monitor", monitoringDuration: 5000 } },
        }),
      )

      // No node applied the config; showing the new values would misreport.
      expect(state["cluster-1"].status).toBe("failed")
      expect(state["cluster-1"].monitoring.monitoringDuration).toBe(previousDuration)
    })

    it("represents a partial failure distinctly from a total failure", () => {
      const state = configReducer(
        initialState,
        updateConfigFailed({
          clusterId: "cluster-1",
          outcome: "failed",
          nodeResults: [
            { nodeId: "node-1", success: true, message: "ok" },
            { nodeId: "node-2", success: false, message: "boom" },
          ],
        }),
      )

      expect(state["cluster-1"].status).toBe("partial")
      expect(state["cluster-1"].succeededCount).toBe(1)
      expect(state["cluster-1"].nodeStatuses["node-1"].status).toBe("succeeded")
      expect(state["cluster-1"].nodeStatuses["node-2"].status).toBe("failed")
    })

    it("represents a not-attempted outcome with not_attempted node statuses, none failed", () => {
      const state = configReducer(
        initialState,
        updateConfigFailed({
          clusterId: "cluster-1",
          outcome: "not_attempted",
          nodeResults: [],
          notAttemptedNodeIds: ["node-1", "node-2"],
        }),
      )

      expect(state["cluster-1"].status).toBe("not_attempted")
      // The reply's not-attempted nodes get REAL entries with that status —
      // not an empty map that would satisfy a vacuous `.every()`.
      const statuses = Object.values(state["cluster-1"].nodeStatuses).map((e) => e.status)
      expect(statuses).toEqual(["not_attempted", "not_attempted"])
      expect(state["cluster-1"].nodeStatuses["node-1"].message!.length).toBeGreaterThan(0)
    })

    it("sets failed status on the standalone entry keyed by nodeId", () => {
      const state = configReducer(
        initialState,
        updateConfigFailed({
          nodeId: "host-6379",
          outcome: "failed",
          nodeResults: [{ nodeId: "host-6379", success: false, message: "nope" }],
        }),
      )

      expect(state["host-6379"].status).toBe("failed")
      expect(state["host-6379"].errorMessage).toBe("nope")
    })

    it("backfills a missing failed-node message", () => {
      const state = configReducer(
        initialState,
        updateConfigFailed({
          clusterId: "cluster-1",
          outcome: "failed",
          nodeResults: [{ nodeId: "node-1", success: false, message: "" }],
        }),
      )

      expect(state["cluster-1"].nodeStatuses["node-1"].message!.length).toBeGreaterThan(0)
    })

    it("leaves state unchanged and records a rejection when the target id is missing", () => {
      const seeded = configReducer(
        initialState,
        setConfig({ connectionId: "host-6379-db0", connectionDetails: {} }),
      )
      const state = configReducer(
        seeded,
        updateConfigFailed({ outcome: "failed", nodeResults: [{ nodeId: "x", success: false, message: "y" }] }),
      )

      expect(state["host-6379"]).toEqual(seeded["host-6379"])
    })
  })

  describe("config/updateConfig (optimistic session reset)", () => {
    const config = { epic: { name: "monitor" } }

    it("keys by clusterId when present", () => {
      const state = configReducer(
        initialState,
        updateConfig({ connectionId: "node-1-db0", clusterId: "cluster-1", config }),
      )
      expect(state["cluster-1"].status).toBe("updating")
      expect(state["node-1"]).toBeUndefined()
    })

    it("keys by the db-less nodeId when no clusterId", () => {
      const state = configReducer(
        initialState,
        updateConfig({ connectionId: "host-6379-db0", config }),
      )
      expect(state["host-6379"].status).toBe("updating")
    })

    it("does NOT reset state on a config-less dispatch (defensive guard)", () => {
      const failed = configReducer(
        initialState,
        updateConfigFailed({
          clusterId: "cluster-1",
          outcome: "failed",
          nodeResults: [{ nodeId: "node-1", success: false, message: "down" }],
        }),
      )
      // A stop/start without a config push starts no server session; the
      // stored failure state must survive.
      const state = configReducer(
        failed,
        updateConfig({ connectionId: "node-1-db0", clusterId: "cluster-1", monitorAction: "stop" }),
      )
      expect(state["cluster-1"].status).toBe("failed")
      expect(state["cluster-1"].nodeStatuses["node-1"].status).toBe("failed")
    })
  })

  describe("nodeStatuses lifecycle (live server retry session)", () => {
    it("upserts per-node statuses from live pushes", () => {
      let state = configReducer(
        initialState,
        updateConfigNodeStatus({
          clusterId: "cluster-1",
          nodeId: "node-2",
          status: "attempting",
          attempt: 1,
          maxAttempts: 7,
        }),
      )
      state = configReducer(
        state,
        updateConfigNodeStatus({
          clusterId: "cluster-1",
          nodeId: "node-2",
          status: "retrying",
          attempt: 1,
          maxAttempts: 7,
          nextRetryMs: 1000,
          message: "flaky",
        }),
      )

      expect(state["cluster-1"].nodeStatuses["node-2"]).toEqual({
        status: "retrying",
        attempt: 1,
        maxAttempts: 7,
        nextRetryMs: 1000,
        message: "flaky",
      })
    })

    it("reconciles live statuses to terminal values on the final reply", () => {
      let state = configReducer(
        initialState,
        updateConfigNodeStatus({
          clusterId: "cluster-1",
          nodeId: "node-2",
          status: "retrying",
          attempt: 3,
          maxAttempts: 7,
          message: "down",
        }),
      )
      state = configReducer(
        state,
        updateConfigFailed({
          clusterId: "cluster-1",
          outcome: "failed",
          nodeResults: [
            { nodeId: "node-1", success: true, message: "ok" },
            { nodeId: "node-2", success: false, message: "exhausted" },
          ],
        }),
      )

      expect(state["cluster-1"].nodeStatuses["node-2"].status).toBe("failed")
      expect(state["cluster-1"].nodeStatuses["node-2"].message).toBe("exhausted")
      expect(state["cluster-1"].nodeStatuses["node-1"].status).toBe("succeeded")
    })

    it("clears node statuses when a fresh save (with config) is dispatched", () => {
      let state = configReducer(
        initialState,
        updateConfigNodeStatus({
          clusterId: "cluster-1",
          nodeId: "node-2",
          status: "failed",
          attempt: 7,
          maxAttempts: 7,
          message: "down",
        }),
      )
      state = configReducer(
        state,
        updateConfig({
          connectionId: "node-1-db0",
          clusterId: "cluster-1",
          config: { epic: { name: "monitor" } },
        }),
      )

      expect(state["cluster-1"].status).toBe("updating")
      expect(state["cluster-1"].nodeStatuses).toEqual({})
    })

    it("drops a node from nodeStatuses when the final reply no longer mentions it", () => {
      // A push for a node that is later removed from the cluster: the final
      // reply omits it, so reconcile must REBUILD the map, not merge into it —
      // otherwise the stale entry pins the banner open forever.
      let state = configReducer(
        initialState,
        updateConfigNodeStatus({
          clusterId: "cluster-1",
          nodeId: "removed-node",
          status: "retrying",
          attempt: 2,
          maxAttempts: 7,
          message: "down",
        }),
      )
      state = configReducer(
        state,
        updateConfigFulfilled({
          clusterId: "cluster-1",
          outcome: "fulfilled",
          nodeResults: [{ nodeId: "node-1", success: true, message: "ok" }],
        }),
      )

      expect(state["cluster-1"].nodeStatuses["removed-node"]).toBeUndefined()
      expect(state["cluster-1"].nodeStatuses["node-1"].status).toBe("succeeded")
    })

    it("rejects a malformed status push without disturbing state", () => {
      const seeded = configReducer(
        initialState,
        setConfig({ connectionId: "host-6379-db0", connectionDetails: {} }),
      )
      const state = configReducer(
        seeded,
        updateConfigNodeStatus({ status: "attempting", attempt: 1, maxAttempts: 7 }),
      )

      expect(state["host-6379"]).toEqual(seeded["host-6379"])
    })
  })

  describe("notAttemptedNodeIds (Req 6.4/6.8)", () => {
    it("stores not-attempted nodes from a failed reply", () => {
      const state = configReducer(
        initialState,
        updateConfigFailed({
          clusterId: "cluster-1",
          outcome: "failed",
          nodeResults: [{ nodeId: "node-1", success: false, message: "boom" }],
          notAttemptedNodeIds: ["ghost"],
        }),
      )

      expect(state["cluster-1"].notAttemptedNodeIds).toEqual(["ghost"])
    })

    it("stores not-attempted nodes even on a fulfilled reply", () => {
      const state = configReducer(
        initialState,
        updateConfigFulfilled({
          clusterId: "cluster-1",
          outcome: "fulfilled",
          nodeResults: [{ nodeId: "node-1", success: true, message: "ok" }],
          notAttemptedNodeIds: ["ghost"],
        }),
      )

      expect(state["cluster-1"].status).toBe("updated")
      expect(state["cluster-1"].notAttemptedNodeIds).toEqual(["ghost"])
    })
  })

  describe("kind classification", () => {
    it("records cluster kind from the reply arm", () => {
      const state = configReducer(
        initialState,
        updateConfigFailed({ clusterId: "cluster-1", outcome: "failed", nodeResults: [] }),
      )
      expect(state["cluster-1"].kind).toBe("cluster")
    })

    it("records standalone kind from the reply arm and the dispatch payload", () => {
      const failed = configReducer(
        initialState,
        updateConfigFailed({
          nodeId: "host-6379",
          outcome: "failed",
          nodeResults: [{ nodeId: "host-6379", success: false, message: "x" }],
        }),
      )
      expect(failed["host-6379"].kind).toBe("standalone")

      const updating = configReducer(
        initialState,
        updateConfig({ connectionId: "host-6379-db0", config: { epic: { name: "monitor" } } }),
      )
      expect(updating["host-6379"].kind).toBe("standalone")
    })
  })

  describe("selectConfig", () => {
    it("reads the cluster entry via clusterId", () => {
      const seeded = configReducer(
        initialState,
        setConfig({ connectionId: "node-1-db0", connectionDetails: { clusterId: "cluster-1" } }),
      )
      const rootState = { config: seeded } as never
      expect(selectConfig("cluster-1")(rootState)).toBeDefined()
    })

    it("reads the standalone entry via nodeId", () => {
      const seeded = configReducer(
        initialState,
        setConfig({ connectionId: "host-6379-db0", connectionDetails: {} }),
      )
      const rootState = { config: seeded } as never
      expect(selectConfig("host-6379")(rootState)).toBeDefined()
    })
  })
})
