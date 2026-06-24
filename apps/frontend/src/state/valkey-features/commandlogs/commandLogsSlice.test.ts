import { describe, it, expect } from "vitest"
import { COMMANDLOG_TYPE } from "@common/src/constants.ts"
import commandLogsReducer, {
  commandLogsRequested,
  commandLogsFulfilled,
  commandLogsError
} from "./commandLogsSlice"

describe("commandLogsSlice", () => {
  const initialState = {}

  describe("commandLogsRequested", () => {
    it("keys the standalone pending entry by the db-less nodeId", () => {
      const state = commandLogsReducer(
        initialState,
        commandLogsRequested({ connectionId: "host-6379-db0" }),
      )

      expect(state["host-6379"]).toBeDefined()
      expect(state["host-6379-db0"]).toBeUndefined()
      expect(state["host-6379"].loading).toBe(true)
    })

    it("collapses two connections to the same node on different dbs into one entry", () => {
      const afterDb0 = commandLogsReducer(
        initialState,
        commandLogsRequested({ connectionId: "host-6379-db0" }),
      )
      const afterDb1 = commandLogsReducer(
        afterDb0,
        commandLogsRequested({ connectionId: "host-6379-db1" }),
      )

      expect(Object.keys(afterDb1)).toEqual(["host-6379"])
    })

    it("keys the cluster pending entry by clusterId", () => {
      const state = commandLogsReducer(
        initialState,
        commandLogsRequested({ connectionId: "node-1-db0", clusterId: "cluster-1" }),
      )

      expect(state["cluster-1"]).toBeDefined()
      expect(state["node-1-db0"]).toBeUndefined()
    })
  })

  describe("commandLogsFulfilled", () => {
    it("keys a standalone reply by nodeId", () => {
      const rows = [{ ts: 1, metric: "slow", values: [] }]
      const state = commandLogsReducer(
        initialState,
        commandLogsFulfilled({
          nodeId: "host-6379",
          commandLogType: COMMANDLOG_TYPE.SLOW,
          parsedResponse: { rows, count: 10 },
        }),
      )

      expect(state["host-6379"]).toBeDefined()
      expect(state["host-6379"].logs[COMMANDLOG_TYPE.SLOW]).toEqual(rows)
      expect(state["host-6379"].count).toBe(10)
      expect(state["host-6379"].loading).toBe(false)
    })

    it("keys a cluster reply by clusterId and keeps nodeErrors db-less", () => {
      const state = commandLogsReducer(
        initialState,
        commandLogsFulfilled({
          clusterId: "cluster-1",
          commandLogType: COMMANDLOG_TYPE.SLOW,
          parsedResponse: { rows: [], count: 0 },
          nodeErrors: [{ nodeId: "node-1", error: "down" }],
        }),
      )

      expect(state["cluster-1"]).toBeDefined()
      expect(state["cluster-1"].nodeErrors).toEqual([{ nodeId: "node-1", error: "down" }])
    })
  })

  describe("commandLogsError", () => {
    it("keys a standalone error by nodeId", () => {
      const seeded = commandLogsReducer(
        initialState,
        commandLogsRequested({ connectionId: "host-6379-db0" }),
      )
      const state = commandLogsReducer(
        seeded,
        commandLogsError({ nodeId: "host-6379", error: { message: "boom" } }),
      )

      expect(state["host-6379"].error).toEqual({ message: "boom" })
      expect(state["host-6379"].loading).toBe(false)
    })

    it("keys a cluster error by clusterId", () => {
      const seeded = commandLogsReducer(
        initialState,
        commandLogsRequested({ connectionId: "node-1-db0", clusterId: "cluster-1" }),
      )
      const state = commandLogsReducer(
        seeded,
        commandLogsError({ clusterId: "cluster-1", error: { message: "boom" } }),
      )

      expect(state["cluster-1"].error).toEqual({ message: "boom" })
    })
  })
})
