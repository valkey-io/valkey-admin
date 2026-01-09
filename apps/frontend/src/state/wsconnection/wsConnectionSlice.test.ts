import { describe, it, expect } from "vitest"
import { CONNECTED, CONNECTING, ERROR, NOT_CONNECTED } from "@common/src/constants"
import wsConnectionReducer, {
  connectPending,
  connectFulfilled,
  connectRejected,
  reconnectAttempt,
  reconnectFailed,
  reconnectExhausted,
  resetConnection,
  type WsConnectionState
} from "./wsConnectionSlice"

describe("wsConnectionSlice", () => {
  const initialState = {
    status: NOT_CONNECTED,
    errorMessage: null,
    reconnect: {
      isRetrying: false,
      currentAttempt: 0,
      maxRetries: 8,
      nextRetryDelay: null,
    },
  } as WsConnectionState

  describe("connectPending", () => {
    it("should set status to CONNECTING and clear error message", () => {
      const previousState = {
        ...initialState,
        status: NOT_CONNECTED,
        errorMessage: "Previous error",
      } as WsConnectionState

      const state = wsConnectionReducer(previousState, connectPending())

      expect(state.status).toBe(CONNECTING)
      expect(state.errorMessage).toBeNull()
    })
  })

  describe("connectFulfilled", () => {
    it("should set status to CONNECTED and clear error message", () => {
      const previousState = {
        ...initialState,
        status: CONNECTING,
      } as WsConnectionState

      const state = wsConnectionReducer(previousState, connectFulfilled())

      expect(state.status).toBe(CONNECTED)
      expect(state.errorMessage).toBeNull()
    })

    it("should clear error message from previous failure", () => {
      const previousState = {
        ...initialState,
        status: CONNECTING,
        errorMessage: "Connection timeout",
      } as WsConnectionState

      const state = wsConnectionReducer(previousState, connectFulfilled())

      expect(state.status).toBe(CONNECTED)
      expect(state.errorMessage).toBeNull()
    })
  })

  describe("connectRejected", () => {
    it("should set status to ERROR and store error message", () => {
      const previousState = {
        ...initialState,
        status: CONNECTING,
      } as WsConnectionState

      const state = wsConnectionReducer(
        previousState,
        connectRejected({ message: "Connection failed" }),
      )

      expect(state.status).toBe(ERROR)
      expect(state.errorMessage).toBe("Connection failed")
      expect(state.reconnect.isRetrying).toBe(false)
    })

    it("should use default error message if not provided", () => {
      const previousState = {
        ...initialState,
        status: CONNECTING,
      } as WsConnectionState

      const state = wsConnectionReducer(previousState, connectRejected({}))

      expect(state.status).toBe(ERROR)
      expect(state.errorMessage).toBe("Server error")
      expect(state.reconnect.isRetrying).toBe(false)
    })

    it("should set isRetrying to false", () => {
      const previousState = {
        ...initialState,
        status: CONNECTING,
        reconnect: {
          isRetrying: true,
          currentAttempt: 2,
          maxRetries: 8,
          nextRetryDelay: 2000,
        },
      } as WsConnectionState

      const state = wsConnectionReducer(
        previousState,
        connectRejected({ message: "Failed" }),
      )

      expect(state.reconnect.isRetrying).toBe(false)
    })
  })

  describe("reconnectAttempt", () => {
    it("should set reconnect state and status to CONNECTING", () => {
      const previousState = {
        ...initialState,
        status: ERROR,
      } as WsConnectionState

      const state = wsConnectionReducer(
        previousState,
        reconnectAttempt({
          attempt: 1,
          maxRetries: 8,
          nextRetryDelay: 1000,
        }),
      )

      expect(state.status).toBe(CONNECTING)
      expect(state.reconnect.isRetrying).toBe(true)
      expect(state.reconnect.currentAttempt).toBe(1)
      expect(state.reconnect.maxRetries).toBe(8)
      expect(state.reconnect.nextRetryDelay).toBe(1000)
    })

    it("should update attempt number on subsequent retries", () => {
      const previousState = {
        ...initialState,
        status: ERROR,
        reconnect: {
          isRetrying: true,
          currentAttempt: 1,
          maxRetries: 8,
          nextRetryDelay: 1000,
        },
      } as WsConnectionState

      const state = wsConnectionReducer(
        previousState,
        reconnectAttempt({
          attempt: 2,
          maxRetries: 8,
          nextRetryDelay: 2000,
        }),
      )

      expect(state.reconnect.currentAttempt).toBe(2)
      expect(state.reconnect.nextRetryDelay).toBe(2000)
      expect(state.reconnect.isRetrying).toBe(true)
    })
  })

  describe("reconnectFailed", () => {
    it("should set isRetrying to false and store error message", () => {
      const previousState = {
        ...initialState,
        status: CONNECTING,
        reconnect: {
          isRetrying: true,
          currentAttempt: 3,
          maxRetries: 8,
          nextRetryDelay: 3000,
        },
      } as WsConnectionState

      const state = wsConnectionReducer(
        previousState,
        reconnectFailed({ error: "Retry failed" }),
      )

      expect(state.reconnect.isRetrying).toBe(false)
      expect(state.errorMessage).toBe("Retry failed")
      // Attempt number should be preserved
      expect(state.reconnect.currentAttempt).toBe(3)
    })
  })

  describe("reconnectExhausted", () => {
    it("should set status to ERROR, stop retrying, and set error message", () => {
      const previousState = {
        ...initialState,
        status: CONNECTING,
        reconnect: {
          isRetrying: true,
          currentAttempt: 8,
          maxRetries: 8,
          nextRetryDelay: null,
        },
      } as WsConnectionState

      const state = wsConnectionReducer(previousState, reconnectExhausted())

      expect(state.status).toBe(ERROR)
      expect(state.reconnect.isRetrying).toBe(false)
      expect(state.errorMessage).toBe("Maximum reconnection attempts reached")
    })
  })

  describe("resetConnection", () => {
    it("should reset all state to initial values", () => {
      const previousState = {
        status: ERROR,
        errorMessage: "Some error",
        reconnect: {
          isRetrying: true,
          currentAttempt: 5,
          maxRetries: 8,
          nextRetryDelay: 5000,
        },
      } as WsConnectionState

      const state = wsConnectionReducer(previousState, resetConnection())

      expect(state).toEqual(initialState)
    })

    it("should reset from CONNECTED state", () => {
      const previousState = {
        status: CONNECTED,
        errorMessage: null,
        reconnect: {
          isRetrying: false,
          currentAttempt: 0,
          maxRetries: 8,
          nextRetryDelay: null,
        },
      } as WsConnectionState

      const state = wsConnectionReducer(previousState, resetConnection())

      expect(state.status).toBe(NOT_CONNECTED)
      expect(state.errorMessage).toBeNull()
      expect(state.reconnect.isRetrying).toBe(false)
      expect(state.reconnect.currentAttempt).toBe(0)
    })
  })

  describe("state transitions", () => {
    it("should handle full connection flow: NOT_CONNECTED -> CONNECTING -> CONNECTED", () => {
      let state = wsConnectionReducer(initialState, connectPending())
      expect(state.status).toBe(CONNECTING)

      state = wsConnectionReducer(state, connectFulfilled())
      expect(state.status).toBe(CONNECTED)
    })

    it("should handle connection failure and retry flow", () => {
      // Start connecting
      let state = wsConnectionReducer(initialState, connectPending())
      expect(state.status).toBe(CONNECTING)

      // Connection fails
      state = wsConnectionReducer(state, connectRejected({ message: "Timeout" }))
      expect(state.status).toBe(ERROR)
      expect(state.errorMessage).toBe("Timeout")

      // Start retry
      state = wsConnectionReducer(
        state,
        reconnectAttempt({ attempt: 1, maxRetries: 8, nextRetryDelay: 1000 }),
      )
      expect(state.status).toBe(CONNECTING)
      expect(state.reconnect.isRetrying).toBe(true)

      // Retry succeeds
      state = wsConnectionReducer(state, connectFulfilled())
      expect(state.status).toBe(CONNECTED)
      expect(state.errorMessage).toBeNull()
    })

    it("should handle exhausted retries", () => {
      let state = wsConnectionReducer(initialState, connectPending())

      // Attempt 1
      state = wsConnectionReducer(
        state,
        reconnectAttempt({ attempt: 1, maxRetries: 3, nextRetryDelay: 1000 }),
      )
      state = wsConnectionReducer(state, reconnectFailed({ error: "Attempt 1 failed" }))

      // Attempt 2
      state = wsConnectionReducer(
        state,
        reconnectAttempt({ attempt: 2, maxRetries: 3, nextRetryDelay: 2000 }),
      )
      state = wsConnectionReducer(state, reconnectFailed({ error: "Attempt 2 failed" }))

      // Attempt 3
      state = wsConnectionReducer(
        state,
        reconnectAttempt({ attempt: 3, maxRetries: 3, nextRetryDelay: 3000 }),
      )
      state = wsConnectionReducer(state, reconnectFailed({ error: "Attempt 3 failed" }))

      // Exhausted
      state = wsConnectionReducer(state, reconnectExhausted())
      expect(state.status).toBe(ERROR)
      expect(state.reconnect.isRetrying).toBe(false)
      expect(state.errorMessage).toBe("Maximum reconnection attempts reached")
    })
  })
})
