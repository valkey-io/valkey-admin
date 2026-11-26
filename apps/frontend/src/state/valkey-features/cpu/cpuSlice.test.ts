import { describe, it, expect } from "vitest"
import cpuReducer, {
  cpuUsageRequested,
  cpuUsageFulfilled,
  cpuUsageError,
} from "./cpuSlice"

describe("cpuSlice", () => {
  const connectionId = "conn-1"

  it("adds a generated requestId via prepare callback when caller does not provide one", () => {
    const action = cpuUsageRequested({ connectionId })
    expect(action.payload.requestId).toBeDefined()
    expect(typeof action.payload.requestId).toBe("string")
    expect(action.payload.requestId.length).toBeGreaterThan(0)
  })

  it("preserves an explicitly provided requestId via prepare callback", () => {
    const explicitId = "custom-req-id-123"
    const action = cpuUsageRequested({ connectionId, requestId: explicitId })
    expect(action.payload.requestId).toBe(explicitId)
  })

  it("updates state with latest requestId when fulfilled", () => {
    const reqAction = cpuUsageRequested({ connectionId, requestId: "req-latest" })
    let state = cpuReducer(undefined, reqAction)
    expect(state[connectionId].loading).toBe(true)
    expect(state[connectionId].lastRequestId).toBe("req-latest")

    const mockData = [{ timestamp: 1000, value: 42.5 }]
    const fulfilledAction = cpuUsageFulfilled({
      connectionId,
      parsedResponse: mockData,
      requestId: "req-latest",
    })
    state = cpuReducer(state, fulfilledAction)
    expect(state[connectionId].data).toEqual(mockData)
    expect(state[connectionId].loading).toBe(false)
  })

  it("ignores fulfilled response with an old requestId, leaving data unchanged and loading true", () => {
    // Initial request 1
    let state = cpuReducer(undefined, cpuUsageRequested({ connectionId, requestId: "req-1" }))
    // Initial fulfillment for request 1
    const initialData = [{ timestamp: 1000, value: 20 }]
    state = cpuReducer(state, cpuUsageFulfilled({ connectionId, parsedResponse: initialData, requestId: "req-1" }))
    expect(state[connectionId].data).toEqual(initialData)

    // Second request 2 sets loading to true
    state = cpuReducer(state, cpuUsageRequested({ connectionId, requestId: "req-2" }))
    expect(state[connectionId].loading).toBe(true)
    expect(state[connectionId].lastRequestId).toBe("req-2")

    // Late arriving fulfillment for request 1 should be ignored
    const staleData = [{ timestamp: 2000, value: 99 }]
    state = cpuReducer(state, cpuUsageFulfilled({ connectionId, parsedResponse: staleData, requestId: "req-1" }))
    expect(state[connectionId].data).toEqual(initialData)
    expect(state[connectionId].loading).toBe(true)
  })

  it("ignores error response with an old requestId, leaving error unset and loading true", () => {
    // Request 1 then Request 2
    let state = cpuReducer(undefined, cpuUsageRequested({ connectionId, requestId: "req-1" }))
    state = cpuReducer(state, cpuUsageRequested({ connectionId, requestId: "req-2" }))
    expect(state[connectionId].loading).toBe(true)

    // Stale error for request 1
    const staleError = { message: "stale network error" }
    state = cpuReducer(state, cpuUsageError({ connectionId, error: staleError, requestId: "req-1" }))
    expect(state[connectionId].error).toBeUndefined()
    expect(state[connectionId].loading).toBe(true)
  })

  it("applies error response when requestId matches latest", () => {
    let state = cpuReducer(undefined, cpuUsageRequested({ connectionId, requestId: "req-latest" }))
    const validError = { message: "valid connection error" }
    state = cpuReducer(state, cpuUsageError({ connectionId, error: validError, requestId: "req-latest" }))
    expect(state[connectionId].error).toEqual(validError)
    expect(state[connectionId].loading).toBe(false)
  })
})
