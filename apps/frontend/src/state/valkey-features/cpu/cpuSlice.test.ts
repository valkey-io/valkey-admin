import { describe, it, expect } from "vitest"
import cpuReducer, {
  cpuUsageRequested,
  cpuUsageFulfilled,
  cpuUsageError,
  selectCpuUsage,
  selectCpuUsageLoading
} from "./cpuSlice"
import type { RootState } from "@/store"

describe("cpuSlice", () => {
  const initialState = {}

  describe("cpuUsageRequested", () => {
    it("keys pending entry by db-less nodeId from connectionId", () => {
      const state = cpuReducer(
        initialState,
        cpuUsageRequested({ connectionId: "host-6379-db0" }),
      )

      expect(state["host-6379"]).toBeDefined()
      expect(state["host-6379-db0"]).toBeUndefined()
      expect(state["host-6379"].loading).toBe(true)
    })

    it("collapses requests from multiple dbs on the same node into the same state key", () => {
      const afterDb0 = cpuReducer(
        initialState,
        cpuUsageRequested({ connectionId: "host-6379-db0" }),
      )
      const afterDb1 = cpuReducer(
        afterDb0,
        cpuUsageRequested({ connectionId: "host-6379-db1" }),
      )

      expect(Object.keys(afterDb1)).toEqual(["host-6379"])
      expect(afterDb1["host-6379"].loading).toBe(true)
    })

    it("accepts explicit nodeId if provided", () => {
      const state = cpuReducer(
        initialState,
        cpuUsageRequested({ connectionId: "host-6379-db0", nodeId: "node-override" }),
      )

      expect(state["node-override"]).toBeDefined()
      expect(state["node-override"].loading).toBe(true)
    })
  })

  describe("cpuUsageFulfilled", () => {
    it("stores parsed response under nodeId", () => {
      const points = [{ timestamp: 1000, value: 42.5 }]
      const state = cpuReducer(
        initialState,
        cpuUsageFulfilled({ nodeId: "host-6379", parsedResponse: points }),
      )

      expect(state["host-6379"].data).toEqual(points)
      expect(state["host-6379"].loading).toBe(false)
    })

    it("resolves connectionId with db suffix to db-less nodeId if nodeId omitted", () => {
      const points = [{ timestamp: 2000, value: 50.0 }]
      const state = cpuReducer(
        initialState,
        cpuUsageFulfilled({ connectionId: "host-6379-db1", parsedResponse: points }),
      )

      expect(state["host-6379"].data).toEqual(points)
      expect(state["host-6379-db1"]).toBeUndefined()
    })

    it("handles invalid response format gracefully", () => {
      const state = cpuReducer(
        initialState,
        cpuUsageFulfilled({ nodeId: "host-6379", parsedResponse: "invalid" as unknown as [] }),
      )

      expect(state["host-6379"].data).toEqual([])
      expect(state["host-6379"].error).toEqual({ message: "Invalid data format received" })
      expect(state["host-6379"].loading).toBe(false)
    })
  })

  describe("cpuUsageError", () => {
    it("sets error under nodeId and clears loading", () => {
      const loadingState = cpuReducer(
        initialState,
        cpuUsageRequested({ connectionId: "host-6379" }),
      )
      const errorState = cpuReducer(
        loadingState,
        cpuUsageError({ nodeId: "host-6379", error: { message: "Failed to fetch CPU" } }),
      )

      expect(errorState["host-6379"].error).toEqual({ message: "Failed to fetch CPU" })
      expect(errorState["host-6379"].loading).toBe(false)
    })
  })

  describe("selectors", () => {
    const rootState = {
      cpu: {
        "host-6379": {
          data: [{ timestamp: 1000, value: 33.3 }],
          loading: false,
        },
      },
    } as unknown as RootState

    it("selectCpuUsage accepts both db-suffixed connectionId and db-less nodeId", () => {
      expect(selectCpuUsage("host-6379-db0")(rootState)).toEqual([{ timestamp: 1000, value: 33.3 }])
      expect(selectCpuUsage("host-6379-db5")(rootState)).toEqual([{ timestamp: 1000, value: 33.3 }])
      expect(selectCpuUsage("host-6379")(rootState)).toEqual([{ timestamp: 1000, value: 33.3 }])
    })

    it("selectCpuUsageLoading accepts both db-suffixed connectionId and db-less nodeId", () => {
      expect(selectCpuUsageLoading("host-6379-db0")(rootState)).toBe(false)
      expect(selectCpuUsageLoading("host-6379")(rootState)).toBe(false)
      expect(selectCpuUsageLoading("unknown-node")(rootState)).toBe(false)
    })
  })
})
