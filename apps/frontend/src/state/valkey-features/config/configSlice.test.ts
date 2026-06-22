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
    it("keys standalone config by connectionId", () => {
      const state = configReducer(
        initialState,
        setConfig({
          connectionId: "host-6379-db0",
          connectionDetails: { keyEvictionPolicy: "noeviction", clusterSlotStatsEnabled: false },
        }),
      )

      expect(state["host-6379-db0"]).toBeDefined()
      expect(state["host-6379-db0"].keyEvictionPolicy).toBe("noeviction")
    })

    it("keys cluster config by clusterId (nested in connectionDetails)", () => {
      const state = configReducer(
        initialState,
        setConfig({
          connectionId: "node-1-db0",
          connectionDetails: { clusterId: "cluster-1", keyEvictionPolicy: "allkeys-lfu", clusterSlotStatsEnabled: true },
        }),
      )

      // Seeded under clusterId, NOT the db-suffixed connectionId.
      expect(state["cluster-1"]).toBeDefined()
      expect(state["node-1-db0"]).toBeUndefined()
      expect(state["cluster-1"].clusterSlotStatsEnabled).toBe(true)
    })
  })

  describe("updateConfigFulfilled (server reply)", () => {
    it("applies monitoring settings on the cluster entry (keyed by clusterId)", () => {
      const seeded = configReducer(
        initialState,
        setConfig({
          connectionId: "node-1-db0",
          connectionDetails: { clusterId: "cluster-1", clusterSlotStatsEnabled: false },
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

    it("applies standalone monitoring settings keyed by connectionId", () => {
      const state = configReducer(
        initialState,
        updateConfigFulfilled({
          connectionId: "host-6379-db0",
          response: { data: { epic: { name: "monitor", monitoringDuration: 1234 } } },
        }),
      )

      expect(state["host-6379-db0"].monitoring.monitoringDuration).toBe(1234)
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
  })

  describe("updateConfig (optimistic, dead path aligned for future use)", () => {
    it("keys by clusterId when present", () => {
      const state = configReducer(initialState, updateConfig({ clusterId: "cluster-1", connectionId: "node-1-db0" }))
      expect(state["cluster-1"].status).toBe("updating")
      expect(state["node-1-db0"]).toBeUndefined()
    })
  })

  describe("selectConfig", () => {
    it("reads the cluster entry via clusterId ?? id", () => {
      const seeded = configReducer(
        initialState,
        setConfig({ connectionId: "node-1-db0", connectionDetails: { clusterId: "cluster-1" } }),
      )
      const rootState = { config: seeded } as never
      expect(selectConfig("cluster-1")(rootState)).toBeDefined()
    })
  })
})
