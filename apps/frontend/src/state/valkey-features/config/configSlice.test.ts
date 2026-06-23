import { describe, it, expect } from "vitest"
import configReducer, {
  setConfig,
  updateConfig,
  updateConfigFulfilled,
  updateConfigFailed,
  selectConfig,
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

    it("seeds only monitoring/status/errorMessage (no dead fields)", () => {
      const state = configReducer(
        initialState,
        setConfig({ connectionId: "host-6379-db0", connectionDetails: {} }),
      )

      const entry = state["host-6379"]
      // ConfigEntry shape is exactly monitoring/status/errorMessage.
      expect(Object.keys(entry).sort()).toEqual(["errorMessage", "monitoring", "status"])
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
          response: { data: { epic: { name: "monitor", monitoringDuration: 5000, monitoringInterval: 7000 } } },
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
          response: { data: { epic: { name: "monitor", monitoringDuration: 1234 } } },
        }),
      )

      expect(state["host-6379"].monitoring.monitoringDuration).toBe(1234)
    })
  })

  describe("updateConfigFailed", () => {
    it("sets failed status on the cluster entry", () => {
      const state = configReducer(
        initialState,
        updateConfigFailed({ clusterId: "cluster-1", response: { errorMessage: "bad config" } }),
      )

      expect(state["cluster-1"].status).toBe("failed")
      expect(state["cluster-1"].errorMessage).toBe("bad config")
    })

    it("sets failed status on the standalone entry keyed by nodeId", () => {
      const state = configReducer(
        initialState,
        updateConfigFailed({ nodeId: "host-6379", response: { errorMessage: "nope" } }),
      )

      expect(state["host-6379"].status).toBe("failed")
      expect(state["host-6379"].errorMessage).toBe("nope")
    })
  })

  describe("updateConfig (optimistic)", () => {
    it("keys by clusterId when present", () => {
      const state = configReducer(initialState, updateConfig({ clusterId: "cluster-1", nodeId: "node-1" }))
      expect(state["cluster-1"].status).toBe("updating")
      expect(state["node-1"]).toBeUndefined()
    })

    it("keys by nodeId when no clusterId", () => {
      const state = configReducer(initialState, updateConfig({ nodeId: "host-6379" }))
      expect(state["host-6379"].status).toBe("updating")
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
