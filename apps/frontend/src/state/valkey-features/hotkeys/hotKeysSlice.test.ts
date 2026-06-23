import { describe, it, expect } from "vitest"
import { PENDING, FULFILLED, ERROR } from "@common/src/constants.ts"
import hotKeysReducer, {
  hotKeysRequested,
  hotKeysFulfilled,
  hotKeysError,
} from "./hotKeysSlice"

describe("hotKeysSlice", () => {
  const initialState = {}

  describe("hotKeysRequested", () => {
    it("keys the standalone pending entry by the db-less nodeId", () => {
      const state = hotKeysReducer(
        initialState,
        hotKeysRequested({ connectionId: "host-6379-db0" }),
      )

      expect(state["host-6379"]).toBeDefined()
      expect(state["host-6379-db0"]).toBeUndefined()
      expect(state["host-6379"].status).toBe(PENDING)
    })

    it("collapses two connections to the same node on different dbs into one entry", () => {
      const afterDb0 = hotKeysReducer(
        initialState,
        hotKeysRequested({ connectionId: "host-6379-db0" }),
      )
      const afterDb1 = hotKeysReducer(
        afterDb0,
        hotKeysRequested({ connectionId: "host-6379-db1" }),
      )

      expect(Object.keys(afterDb1)).toEqual(["host-6379"])
    })

    it("keys the cluster pending entry by clusterId", () => {
      const state = hotKeysReducer(
        initialState,
        hotKeysRequested({ connectionId: "node-1-db0", clusterId: "cluster-1" }),
      )

      expect(state["cluster-1"]).toBeDefined()
      expect(state["node-1-db0"]).toBeUndefined()
    })
  })

  describe("hotKeysFulfilled", () => {
    it("keys a standalone reply by nodeId", () => {
      const state = hotKeysReducer(
        initialState,
        hotKeysFulfilled({
          nodeId: "host-6379",
          parsedResponse: {
            hotKeys: [["k", 1, null, 2]],
            monitorRunning: true,
            checkAt: "now",
            nodeId: "host-6379",
            lastCollectedAt: 100,
          },
        }),
      )

      expect(state["host-6379"]).toBeDefined()
      expect(state["host-6379"].status).toBe(FULFILLED)
      expect(state["host-6379"].monitorRunning).toBe(true)
    })

    it("keys a cluster reply by clusterId and keeps nodeErrors db-less", () => {
      const state = hotKeysReducer(
        initialState,
        hotKeysFulfilled({
          clusterId: "cluster-1",
          parsedResponse: {
            hotKeys: [],
            monitorRunning: false,
            checkAt: null,
            nodeId: null,
            lastCollectedAt: null,
          },
          nodeErrors: [{ nodeId: "node-1", error: "down" }],
        }),
      )

      expect(state["cluster-1"]).toBeDefined()
      expect(state["cluster-1"].nodeErrors).toEqual([{ nodeId: "node-1", error: "down" }])
    })
  })

  describe("hotKeysError", () => {
    it("keys a standalone error by nodeId", () => {
      const state = hotKeysReducer(
        initialState,
        hotKeysError({ nodeId: "host-6379", error: { message: "boom" } }),
      )

      expect(state["host-6379"]).toBeDefined()
      expect(state["host-6379"].status).toBe(ERROR)
      expect(state["host-6379"].error).toEqual({ message: "boom" })
    })

    it("keys a cluster error by clusterId", () => {
      const state = hotKeysReducer(
        initialState,
        hotKeysError({ clusterId: "cluster-1", error: { message: "boom" } }),
      )

      expect(state["cluster-1"].status).toBe(ERROR)
    })
  })
})
