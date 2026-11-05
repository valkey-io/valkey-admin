import { describe, it, expect } from "vitest"
import memoryReducer, {
  memoryUsageRequested,
  memoryUsageFulfilled,
  memoryUsageError,
  selectMemoryUsage,
  selectMemoryUsageLoading
} from "./memorySlice"
import type { RootState } from "@/store"

describe("memorySlice", () => {
  const initialState = {}

  describe("memoryUsageRequested", () => {
    it("keys pending entry by db-less nodeId from connectionId", () => {
      const state = memoryReducer(
        initialState,
        memoryUsageRequested({ connectionId: "host-6379-db0" }),
      )

      expect(state["host-6379"]).toBeDefined()
      expect(state["host-6379-db0"]).toBeUndefined()
      expect(state["host-6379"].loading).toBe(true)
    })

    it("collapses requests from multiple dbs on the same node into the same state key", () => {
      const afterDb0 = memoryReducer(
        initialState,
        memoryUsageRequested({ connectionId: "host-6379-db0" }),
      )
      const afterDb1 = memoryReducer(
        afterDb0,
        memoryUsageRequested({ connectionId: "host-6379-db1" }),
      )

      expect(Object.keys(afterDb1)).toEqual(["host-6379"])
      expect(afterDb1["host-6379"].loading).toBe(true)
    })

    it("accepts explicit nodeId if provided", () => {
      const state = memoryReducer(
        initialState,
        memoryUsageRequested({ connectionId: "host-6379-db0", nodeId: "node-override" }),
      )

      expect(state["node-override"]).toBeDefined()
      expect(state["node-override"].loading).toBe(true)
    })
  })

  describe("memoryUsageFulfilled", () => {
    it("stores parsed response under nodeId", () => {
      const memoryData = {
        used_memory: {
          description: "Used memory in bytes",
          series: [{ timestamp: 1000, value: 1048576 }],
        },
      }
      const state = memoryReducer(
        initialState,
        memoryUsageFulfilled({ nodeId: "host-6379", parsedResponse: memoryData }),
      )

      expect(state["host-6379"].data).toEqual(memoryData)
      expect(state["host-6379"].loading).toBe(false)
    })

    it("resolves connectionId with db suffix to db-less nodeId if nodeId omitted", () => {
      const memoryData = {
        used_memory: {
          description: "Used memory in bytes",
          series: [{ timestamp: 2000, value: 2097152 }],
        },
      }
      const state = memoryReducer(
        initialState,
        memoryUsageFulfilled({ connectionId: "host-6379-db3", parsedResponse: memoryData }),
      )

      expect(state["host-6379"].data).toEqual(memoryData)
      expect(state["host-6379-db3"]).toBeUndefined()
    })

    it("handles invalid response format gracefully", () => {
      const state = memoryReducer(
        initialState,
        memoryUsageFulfilled({ nodeId: "host-6379", parsedResponse: [] as unknown as Record<string, unknown> }),
      )

      expect(state["host-6379"].data).toBeNull()
      expect(state["host-6379"].error).toEqual({ message: "Invalid data format received" })
      expect(state["host-6379"].loading).toBe(false)
    })
  })

  describe("memoryUsageError", () => {
    it("sets error under nodeId and clears loading", () => {
      const loadingState = memoryReducer(
        initialState,
        memoryUsageRequested({ connectionId: "host-6379" }),
      )
      const errorState = memoryReducer(
        loadingState,
        memoryUsageError({ nodeId: "host-6379", error: { message: "Failed to fetch memory" } }),
      )

      expect(errorState["host-6379"].error).toEqual({ message: "Failed to fetch memory" })
      expect(errorState["host-6379"].loading).toBe(false)
    })
  })

  describe("selectors", () => {
    const rootState = {
      memory: {
        "host-6379": {
          data: {
            used_memory: {
              description: "Used memory",
              series: [{ timestamp: 1000, value: 1024 }],
            },
          },
          loading: false,
        },
      },
    } as unknown as RootState

    it("selectMemoryUsage accepts both db-suffixed connectionId and db-less nodeId", () => {
      expect(selectMemoryUsage("host-6379-db0")(rootState)).toEqual({
        used_memory: {
          description: "Used memory",
          series: [{ timestamp: 1000, value: 1024 }],
        },
      })
      expect(selectMemoryUsage("host-6379-db2")(rootState)).toEqual({
        used_memory: {
          description: "Used memory",
          series: [{ timestamp: 1000, value: 1024 }],
        },
      })
      expect(selectMemoryUsage("host-6379")(rootState)).toEqual({
        used_memory: {
          description: "Used memory",
          series: [{ timestamp: 1000, value: 1024 }],
        },
      })
    })

    it("selectMemoryUsageLoading accepts both db-suffixed connectionId and db-less nodeId", () => {
      expect(selectMemoryUsageLoading("host-6379-db0")(rootState)).toBe(false)
      expect(selectMemoryUsageLoading("host-6379")(rootState)).toBe(false)
      expect(selectMemoryUsageLoading("unknown-node")(rootState)).toBe(false)
    })
  })
})
