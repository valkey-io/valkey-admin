import { describe, it, expect } from "vitest"
import memoryReducer, {
  memoryUsageRequested,
  memoryUsageFulfilled,
  memoryUsageError,
} from "./memorySlice"

describe("memorySlice", () => {
  const connectionId = "conn-1"

  it("adds a generated requestId via prepare callback when caller does not provide one", () => {
    const action = memoryUsageRequested({ connectionId })
    expect(action.payload.requestId).toBeDefined()
    expect(typeof action.payload.requestId).toBe("string")
    expect(action.payload.requestId.length).toBeGreaterThan(0)
  })

  it("preserves an explicitly provided requestId via prepare callback", () => {
    const explicitId = "custom-mem-id-456"
    const action = memoryUsageRequested({ connectionId, requestId: explicitId })
    expect(action.payload.requestId).toBe(explicitId)
  })

  it("updates state with latest requestId when fulfilled", () => {
    const reqAction = memoryUsageRequested({ connectionId, requestId: "req-latest" })
    let state = memoryReducer(undefined, reqAction)
    expect(state[connectionId].loading).toBe(true)
    expect(state[connectionId].lastRequestId).toBe("req-latest")

    const mockData = {
      used_memory: {
        description: "Used memory in bytes",
        series: [{ timestamp: 1000, value: 1024000 }],
      },
    }
    const fulfilledAction = memoryUsageFulfilled({
      connectionId,
      parsedResponse: mockData,
      requestId: "req-latest",
    })
    state = memoryReducer(state, fulfilledAction)
    expect(state[connectionId].data).toEqual(mockData)
    expect(state[connectionId].loading).toBe(false)
  })

  it("ignores fulfilled response with an old requestId, leaving data unchanged and loading true", () => {
    // Initial request 1
    let state = memoryReducer(undefined, memoryUsageRequested({ connectionId, requestId: "req-1" }))
    // Initial fulfillment for request 1
    const initialData = {
      used_memory: {
        description: "Initial memory",
        series: [{ timestamp: 1000, value: 500000 }],
      },
    }
    state = memoryReducer(state, memoryUsageFulfilled({ connectionId, parsedResponse: initialData, requestId: "req-1" }))
    expect(state[connectionId].data).toEqual(initialData)

    // Second request 2 sets loading to true
    state = memoryReducer(state, memoryUsageRequested({ connectionId, requestId: "req-2" }))
    expect(state[connectionId].loading).toBe(true)
    expect(state[connectionId].lastRequestId).toBe("req-2")

    // Late arriving fulfillment for request 1 should be ignored
    const staleData = {
      used_memory: {
        description: "Stale memory",
        series: [{ timestamp: 2000, value: 9999999 }],
      },
    }
    state = memoryReducer(state, memoryUsageFulfilled({ connectionId, parsedResponse: staleData, requestId: "req-1" }))
    expect(state[connectionId].data).toEqual(initialData)
    expect(state[connectionId].loading).toBe(true)
  })

  it("ignores error response with an old requestId, leaving error unset and loading true", () => {
    // Request 1 then Request 2
    let state = memoryReducer(undefined, memoryUsageRequested({ connectionId, requestId: "req-1" }))
    state = memoryReducer(state, memoryUsageRequested({ connectionId, requestId: "req-2" }))
    expect(state[connectionId].loading).toBe(true)

    // Stale error for request 1
    const staleError = { message: "stale memory network error" }
    state = memoryReducer(state, memoryUsageError({ connectionId, error: staleError, requestId: "req-1" }))
    expect(state[connectionId].error).toBeUndefined()
    expect(state[connectionId].loading).toBe(true)
  })

  it("applies error response when requestId matches latest", () => {
    let state = memoryReducer(undefined, memoryUsageRequested({ connectionId, requestId: "req-latest" }))
    const validError = { message: "valid memory fetch error" }
    state = memoryReducer(state, memoryUsageError({ connectionId, error: validError, requestId: "req-latest" }))
    expect(state[connectionId].error).toEqual(validError)
    expect(state[connectionId].loading).toBe(false)
  })
})
