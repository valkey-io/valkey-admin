import { describe, it, expect } from "vitest"
import monitorReducer, {
  monitorRequested,
  monitorFulfilled,
  monitorError,
  saveMonitorSettingsRequested,
  selectMonitorRunning,
  selectMonitorLoading
} from "./monitorSlice"

describe("monitorSlice", () => {
  const initialState = {}

  describe("monitorRequested", () => {
    it("should create state for new connectionId and set loading to true", () => {
      const state = monitorReducer(
        initialState,
        monitorRequested({ connectionId: "conn-1" }),
      )

      expect(state["conn-1"]).toBeDefined()
      expect(state["conn-1"].loading).toBe(true)
      expect(state["conn-1"].monitorRunning).toBe(false)
      expect(state["conn-1"].checkAt).toBeNull()
    })

    it("should set loading to true on existing state and preserve other fields", () => {
      const previousState = {
        "conn-1": {
          monitorRunning: true,
          checkAt: 12345,
          loading: false,
          error: null,
        },
      }

      const state = monitorReducer(
        previousState,
        monitorRequested({ connectionId: "conn-1" }),
      )

      expect(state["conn-1"].loading).toBe(true)
      expect(state["conn-1"].monitorRunning).toBe(true)
      expect(state["conn-1"].checkAt).toBe(12345)
    })
  })

  describe("monitorFulfilled", () => {
    it("should set monitorRunning true with checkAt and clear loading/error", () => {
      const previousState = {
        "conn-1": {
          monitorRunning: false,
          checkAt: null,
          loading: true,
          error: "old error",
        },
      }

      const state = monitorReducer(
        previousState,
        monitorFulfilled({
          connectionId: "conn-1",
          parsedResponse: { monitorRunning: true, checkAt: 99999 },
        }),
      )

      expect(state["conn-1"].monitorRunning).toBe(true)
      expect(state["conn-1"].checkAt).toBe(99999)
      expect(state["conn-1"].loading).toBe(false)
      expect(state["conn-1"].error).toBeNull()
    })

    it("should set monitorRunning false when response says false", () => {
      const previousState = {
        "conn-1": {
          monitorRunning: true,
          checkAt: 12345,
          loading: true,
          error: null,
        },
      }

      const state = monitorReducer(
        previousState,
        monitorFulfilled({
          connectionId: "conn-1",
          parsedResponse: { monitorRunning: false, checkAt: null },
        }),
      )

      expect(state["conn-1"].monitorRunning).toBe(false)
      expect(state["conn-1"].checkAt).toBeNull()
    })

    it("should initialize state if connectionId does not exist yet", () => {
      const state = monitorReducer(
        initialState,
        monitorFulfilled({
          connectionId: "conn-new",
          parsedResponse: { monitorRunning: true, checkAt: 55555 },
        }),
      )

      expect(state["conn-new"]).toBeDefined()
      expect(state["conn-new"].monitorRunning).toBe(true)
      expect(state["conn-new"].checkAt).toBe(55555)
      expect(state["conn-new"].loading).toBe(false)
      expect(state["conn-new"].error).toBeNull()
    })
  })

  describe("monitorError", () => {
    it("should set error and clear loading on existing connectionId", () => {
      const previousState = {
        "conn-1": {
          monitorRunning: false,
          checkAt: null,
          loading: true,
          error: null,
        },
      }

      const state = monitorReducer(
        previousState,
        monitorError({ connectionId: "conn-1", error: "something failed" }),
      )

      expect(state["conn-1"].error).toBe("something failed")
      expect(state["conn-1"].loading).toBe(false)
    })

    it("should no-op on missing connectionId", () => {
      const state = monitorReducer(
        initialState,
        monitorError({ connectionId: "nonexistent", error: "fail" }),
      )

      expect(state["nonexistent"]).toBeUndefined()
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
        "conn-1": {
          monitorRunning: true,
          checkAt: 12345,
          loading: false,
          error: null,
        },
      }

      const state = monitorReducer(
        previousState,
        saveMonitorSettingsRequested({ connectionId: "conn-1", monitorAction: "stop" }),
      )

      expect(state["conn-1"]).toEqual(previousState["conn-1"])
    })
  })

  describe("selectors", () => {
    it("selectMonitorRunning returns true when monitor is running", () => {
      const rootState = {
        monitor: {
          "conn-1": { monitorRunning: true, checkAt: null, loading: false },
        },
      }

      expect(selectMonitorRunning("conn-1")(rootState as never)).toBe(true)
    })

    it("selectMonitorRunning defaults to false for missing connectionId", () => {
      const rootState = { monitor: {} }

      expect(selectMonitorRunning("missing")(rootState as never)).toBe(false)
    })

    it("selectMonitorLoading returns true when loading", () => {
      const rootState = {
        monitor: {
          "conn-1": { monitorRunning: false, checkAt: null, loading: true },
        },
      }

      expect(selectMonitorLoading("conn-1")(rootState as never)).toBe(true)
    })

    it("selectMonitorLoading defaults to false for missing connectionId", () => {
      const rootState = { monitor: {} }

      expect(selectMonitorLoading("missing")(rootState as never)).toBe(false)
    })
  })
})
