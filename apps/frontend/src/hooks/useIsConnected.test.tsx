import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { Provider } from "react-redux"
import { CONNECTED, CONNECTING, DISCONNECTED, ERROR } from "@common/src/constants"
import useIsConnected from "./useIsConnected"
import { setupTestStore } from "@/test/utils/test-utils"
import { mockConnectionState } from "@/test/utils/mocks"
import { standaloneConnectFulfilled } from "@/state/valkey-features/connection/connectionSlice"

// Mock react-router
const mockParams = { id: "conn-1" }

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router")
  return {
    ...actual,
    useParams: () => mockParams,
  }
})

describe("useIsConnected", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should return true when status is CONNECTED", () => {
    // User should stay on page when connection is active
    const store = setupTestStore({
      valkeyConnection: {
        connections: {
          "conn-1": mockConnectionState({
            status: CONNECTED,
          }),
        },
      },
    })

    const { result } = renderHook(() => useIsConnected(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    })

    expect(result.current).toBe(true)
  })

  it("should return true when status is DISCONNECTED", () => {
    const store = setupTestStore({
      valkeyConnection: {
        connections: {
          "conn-1": mockConnectionState({
            status: DISCONNECTED,
          }),
        },
      },
    })

    const { result } = renderHook(() => useIsConnected(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    })

    expect(result.current).toBe(true)
  })

  it("should return true when status is CONNECTING", () => {
    const store = setupTestStore({
      valkeyConnection: {
        connections: {
          "conn-1": mockConnectionState({
            status: CONNECTING,
          }),
        },
      },
    })

    const { result } = renderHook(() => useIsConnected(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    })

    expect(result.current).toBe(true)
  })

  it("should return true when status is ERROR", () => {
    const store = setupTestStore({
      valkeyConnection: {
        connections: {
          "conn-1": mockConnectionState({
            status: ERROR,
            errorMessage: "Connection failed",
          }),
        },
      },
    })

    const { result } = renderHook(() => useIsConnected(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    })

    expect(result.current).toBe(true)
  })

  it("should return false when status is undefined (no connection found)", () => {
    const store = setupTestStore({
      valkeyConnection: {
        connections: {},
      },
    })

    const { result } = renderHook(() => useIsConnected(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    })

    expect(result.current).toBe(false)
  })

  it("should update when Redux state changes", () => {
    const store = setupTestStore({
      valkeyConnection: {
        connections: {
          "conn-1": mockConnectionState({
            status: CONNECTING,
          }),
        },
      },
    })

    const { result, rerender } = renderHook(() => useIsConnected(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    })

    expect(result.current).toBe(true)

    // Update status to CONNECTED using action creator
    store.dispatch(standaloneConnectFulfilled({
      connectionId: "conn-1",
      connectionDetails: mockConnectionState().connectionDetails,
    }))

    rerender()

    expect(result.current).toBe(true)
  })

  it("should handle missing connection gracefully", () => {
    const store = setupTestStore({
      valkeyConnection: {
        connections: {
          "different-conn": mockConnectionState({
            status: CONNECTED,
          }),
        },
      },
    })

    const { result } = renderHook(() => useIsConnected(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    })

    // conn-1 doesn't exist, so status will be undefined
    expect(result.current).toBe(false)
  })
})
