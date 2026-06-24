import { describe, it, expect } from "vitest"
import monitorReducer, {
  monitorRequested,
  monitorFulfilled,
  monitorError,
  saveMonitorSettingsRequested,
  selectMonitorRunning,
  selectMonitorLoading,
  selectClusterMonitorRunning,
  selectClusterMonitorLoading,
  selectRunningMonitorConnections
} from "./monitorSlice"

describe("monitorSlice", () => {
  const initialState = {}

  describe("monitorRequested", () => {
    it("should create a node-keyed entry from a db-suffixed connectionId and set loading", () => {
      const state = monitorReducer(
        initialState,
        monitorRequested({ connectionId: "host-6379-db0" }),
      )

      // Standalone pending entries are keyed by the db-less nodeId.
      expect(state["host-6379"]).toBeDefined()
      expect(state["host-6379-db0"]).toBeUndefined()
      expect(state["host-6379"].loading).toBe(true)
      expect(state["host-6379"].monitorRunning).toBe(false)
      expect(state["host-6379"].checkAt).toBeNull()
    })

    it("should collapse two connections to the same node on different dbs into a single entry", () => {
      const afterDb0 = monitorReducer(
        initialState,
        monitorRequested({ connectionId: "host-6379-db0" }),
      )
      const afterDb1 = monitorReducer(
        afterDb0,
        monitorRequested({ connectionId: "host-6379-db1" }),
      )

      // Both connections resolve to the same db-less nodeId → one entry.
      expect(Object.keys(afterDb1)).toEqual(["host-6379"])
    })

    it("should set loading to true on existing state and preserve other fields", () => {
      const previousState = {
        "host-6379": {
          monitorRunning: true,
          checkAt: 12345,
          loading: false,
          startedAt: 100,
          error: null,
        },
      }

      const state = monitorReducer(
        previousState,
        monitorRequested({ connectionId: "host-6379-db0" }),
      )

      expect(state["host-6379"].loading).toBe(true)
      expect(state["host-6379"].monitorRunning).toBe(true)
      expect(state["host-6379"].checkAt).toBe(12345)
    })

    it("should NOT create a pending entry under the connection id on the cluster path", () => {
      const state = monitorReducer(
        initialState,
        monitorRequested({ connectionId: "node-1-db0", clusterId: "cluster-1" }),
      )

      // Per-node entries come from replies; no orphan entry under the route id.
      expect(state["node-1-db0"]).toBeUndefined()
    })
  })

  describe("cluster monitor keying and selectors", () => {
    it("keys cluster fulfilled by nodeId and tags clusterId", () => {
      const state = monitorReducer(
        initialState,
        monitorFulfilled({
          clusterId: "cluster-1",
          nodeId: "node-1",
          parsedResponse: { monitorRunning: true, checkAt: 1, startedAt: 2 },
        }),
      )

      expect(state["node-1"]).toBeDefined()
      expect(state["node-1"].clusterId).toBe("cluster-1")
      expect(state["node-1"].monitorRunning).toBe(true)
    })

    it("selectClusterMonitorRunning is true only when all present cluster nodes run", () => {
      const running = {
        "node-1": { monitorRunning: true, checkAt: null, loading: false, startedAt: null, clusterId: "c1" },
        "node-2": { monitorRunning: true, checkAt: null, loading: false, startedAt: null, clusterId: "c1" },
      }
      const partial = {
        ...running,
        "node-2": { monitorRunning: false, checkAt: null, loading: false, startedAt: null, clusterId: "c1" },
      }
      expect(selectClusterMonitorRunning("c1")({ monitor: running } as never)).toBe(true)
      expect(selectClusterMonitorRunning("c1")({ monitor: partial } as never)).toBe(false)
      // No entries for the cluster → not running.
      expect(selectClusterMonitorRunning("c1")({ monitor: {} } as never)).toBe(false)
    })

    it("selectClusterMonitorLoading is true when any cluster node is loading", () => {
      const state = {
        "node-1": { monitorRunning: false, checkAt: null, loading: true, startedAt: null, clusterId: "c1" },
        "node-2": { monitorRunning: false, checkAt: null, loading: false, startedAt: null, clusterId: "c1" },
      }
      expect(selectClusterMonitorLoading("c1")({ monitor: state } as never)).toBe(true)
    })

    it("selectRunningMonitorConnections includes clusterId for grouping", () => {
      const state = {
        "node-1": { monitorRunning: true, checkAt: null, loading: false, startedAt: 5, clusterId: "c1" },
        "host-6379": { monitorRunning: true, checkAt: null, loading: false, startedAt: 6 },
      }
      const running = selectRunningMonitorConnections({ monitor: state } as never)
      const node1 = running.find((r) => r.nodeId === "node-1")
      expect(node1?.clusterId).toBe("c1")
      expect(node1?.startedAt).toBe(5)
      const standalone = running.find((r) => r.nodeId === "host-6379")
      expect(standalone?.clusterId).toBeUndefined()
    })
  })

  describe("monitorFulfilled", () => {
    it("should set monitorRunning true with checkAt and clear loading/error", () => {
      const previousState = {
        "host-6379": {
          monitorRunning: false,
          checkAt: null,
          loading: true,
          startedAt: null,
          error: "old error",
        },
      }

      const state = monitorReducer(
        previousState,
        monitorFulfilled({
          nodeId: "host-6379",
          parsedResponse: { monitorRunning: true, checkAt: 99999, startedAt: 88888 },
        }),
      )

      expect(state["host-6379"].monitorRunning).toBe(true)
      expect(state["host-6379"].checkAt).toBe(99999)
      expect(state["host-6379"].startedAt).toBe(88888)
      expect(state["host-6379"].loading).toBe(false)
      expect(state["host-6379"].error).toBeNull()
    })

    it("should set monitorRunning false when response says false", () => {
      const previousState = {
        "host-6379": {
          monitorRunning: true,
          checkAt: 12345,
          loading: true,
          startedAt: 100,
          error: null,
        },
      }

      const state = monitorReducer(
        previousState,
        monitorFulfilled({
          nodeId: "host-6379",
          parsedResponse: { monitorRunning: false, checkAt: null },
        }),
      )

      expect(state["host-6379"].monitorRunning).toBe(false)
      expect(state["host-6379"].checkAt).toBeNull()
    })

    it("should initialize state if nodeId does not exist yet", () => {
      const state = monitorReducer(
        initialState,
        monitorFulfilled({
          nodeId: "host-new",
          parsedResponse: { monitorRunning: true, checkAt: 55555 },
        }),
      )

      expect(state["host-new"]).toBeDefined()
      expect(state["host-new"].monitorRunning).toBe(true)
      expect(state["host-new"].checkAt).toBe(55555)
      expect(state["host-new"].loading).toBe(false)
      expect(state["host-new"].error).toBeNull()
    })
  })

  describe("monitorError", () => {
    it("should set error and clear loading on existing nodeId", () => {
      const previousState = {
        "host-6379": {
          monitorRunning: false,
          checkAt: null,
          loading: true,
          startedAt: null,
          error: null,
        },
      }

      const state = monitorReducer(
        previousState,
        monitorError({ nodeId: "host-6379", error: "something failed" }),
      )

      expect(state["host-6379"].error).toBe("something failed")
      expect(state["host-6379"].loading).toBe(false)
    })

    it("should create-or-update on missing nodeId so cluster errors are not dropped", () => {
      const state = monitorReducer(
        initialState,
        monitorError({ nodeId: "nonexistent", error: "fail" }),
      )

      expect(state["nonexistent"]).toBeDefined()
      expect(state["nonexistent"].error).toBe("fail")
      expect(state["nonexistent"].loading).toBe(false)
    })

    it("should key cluster errors by nodeId and tag clusterId", () => {
      const state = monitorReducer(
        initialState,
        monitorError({ clusterId: "cluster-1", nodeId: "node-1", error: "node down" }),
      )

      expect(state["node-1"]).toBeDefined()
      expect(state["node-1"].clusterId).toBe("cluster-1")
      expect(state["node-1"].error).toBe("node down")
    })
  })

  describe("saveMonitorSettingsRequested", () => {
    it("should not change empty state", () => {
      const state = monitorReducer(
        initialState,
        saveMonitorSettingsRequested({ connectionId: "conn-1", config: { epic: { name: "monitor" } }, monitorAction: "start" }),
      )

      expect(state).toEqual({})
    })

    it("should not change existing state", () => {
      const previousState = {
        "host-6379": {
          monitorRunning: true,
          checkAt: 12345,
          loading: false,
          startedAt: 100,
          error: null,
        },
      }

      const state = monitorReducer(
        previousState,
        saveMonitorSettingsRequested({ connectionId: "host-6379-db0", monitorAction: "stop" }),
      )

      expect(state["host-6379"]).toEqual(previousState["host-6379"])
    })
  })

  describe("selectors", () => {
    it("selectMonitorRunning returns true when monitor is running for a nodeId", () => {
      const rootState = {
        monitor: {
          "host-6379": { monitorRunning: true, checkAt: null, loading: false, startedAt: null },
        },
      }

      expect(selectMonitorRunning("host-6379")(rootState as never)).toBe(true)
    })

    it("selectMonitorRunning defaults to false for missing nodeId", () => {
      const rootState = { monitor: {} }

      expect(selectMonitorRunning("missing")(rootState as never)).toBe(false)
    })

    it("selectMonitorLoading returns true when loading", () => {
      const rootState = {
        monitor: {
          "host-6379": { monitorRunning: false, checkAt: null, loading: true, startedAt: null },
        },
      }

      expect(selectMonitorLoading("host-6379")(rootState as never)).toBe(true)
    })

    it("selectMonitorLoading defaults to false for missing nodeId", () => {
      const rootState = { monitor: {} }

      expect(selectMonitorLoading("missing")(rootState as never)).toBe(false)
    })
  })
})
