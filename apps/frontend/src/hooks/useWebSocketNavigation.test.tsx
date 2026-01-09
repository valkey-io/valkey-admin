import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { Provider } from "react-redux"
import { BrowserRouter } from "react-router"
import { CONNECTED, CONNECTING, ERROR } from "@common/src/constants"
import { useWebSocketNavigation } from "./useWebSocketNavigation"
import { setupTestStore } from "@/test/utils/test-utils"
import { mockWebSocketState } from "@/test/utils/mocks"

// Mock react-router
const mockNavigate = vi.fn()
let mockLocation = { pathname: "/dashboard" }

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
  }
})

describe("useWebSocketNavigation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    mockLocation = { pathname: "/dashboard" }
  })

  it("should not navigate when already on /reconnect page", () => {
    mockLocation = { pathname: "/reconnect" }

    const store = setupTestStore({
      websocket: mockWebSocketState({
        status: ERROR,
        reconnect: { isRetrying: true, currentAttempt: 1, maxRetries: 8, nextRetryDelay: 1000 },
      }),
    })

    renderHook(() => useWebSocketNavigation(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <BrowserRouter>{children}</BrowserRouter>
        </Provider>
      ),
    })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("should not navigate when on /connect page", () => {
    mockLocation = { pathname: "/connect" }

    const store = setupTestStore({
      websocket: mockWebSocketState({
        status: ERROR,
        reconnect: { isRetrying: true, currentAttempt: 1, maxRetries: 8, nextRetryDelay: 1000 },
      }),
    })

    renderHook(() => useWebSocketNavigation(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <BrowserRouter>{children}</BrowserRouter>
        </Provider>
      ),
    })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("should navigate to /reconnect and store previous location on ERROR without retry", () => {
    mockLocation = { pathname: "/dashboard" }

    const store = setupTestStore({
      websocket: mockWebSocketState({
        status: ERROR,
        reconnect: { isRetrying: false, currentAttempt: 0, maxRetries: 8, nextRetryDelay: null },
      }),
    })

    renderHook(() => useWebSocketNavigation(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <BrowserRouter>{children}</BrowserRouter>
        </Provider>
      ),
    })

    expect(mockNavigate).toHaveBeenCalledWith("/reconnect", { replace: true })
    expect(sessionStorage.getItem("previousLocation")).toBe("/dashboard")
  })

  it("should navigate to /reconnect when connection drops from CONNECTED to CONNECTING with retry", () => {
    mockLocation = { pathname: "/keys" }

    // Initial state: CONNECTED
    const store = setupTestStore({
      websocket: mockWebSocketState({
        status: CONNECTED,
        reconnect: { isRetrying: false, currentAttempt: 0, maxRetries: 8, nextRetryDelay: null },
      }),
    })

    const { rerender } = renderHook(() => useWebSocketNavigation(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <BrowserRouter>{children}</BrowserRouter>
        </Provider>
      ),
    })

    // Simulate status change to CONNECTING with retry
    store.dispatch({
      type: "wsconnection/reconnectAttempt",
      payload: { attempt: 1, maxRetries: 8, nextRetryDelay: 1000 },
    })
    store.dispatch({ type: "wsconnection/connectPending" })

    rerender()

    expect(mockNavigate).toHaveBeenCalledWith("/reconnect", { replace: true })
    expect(sessionStorage.getItem("previousLocation")).toBe("/keys")
  })

  it("should not navigate if status transitions but isRetrying is false", () => {
    mockLocation = { pathname: "/monitoring" }

    const store = setupTestStore({
      websocket: mockWebSocketState({
        status: CONNECTING,
        reconnect: { isRetrying: false, currentAttempt: 0, maxRetries: 8, nextRetryDelay: null },
      }),
    })

    renderHook(() => useWebSocketNavigation(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <BrowserRouter>{children}</BrowserRouter>
        </Provider>
      ),
    })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("should update previous status ref correctly", () => {
    mockLocation = { pathname: "/settings" }

    // Start with CONNECTED
    const store = setupTestStore({
      websocket: mockWebSocketState({
        status: CONNECTED,
        reconnect: { isRetrying: false, currentAttempt: 0, maxRetries: 8, nextRetryDelay: null },
      }),
    })

    const { rerender } = renderHook(() => useWebSocketNavigation(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <BrowserRouter>{children}</BrowserRouter>
        </Provider>
      ),
    })

    // Change to CONNECTING without retry (should not navigate)
    store.dispatch({ type: "wsconnection/connectPending" })
    rerender()

    // Should not navigate because wasConnected is true but isRetrying is false
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("should handle multiple reconnect attempts", () => {
    mockLocation = { pathname: "/cluster" }

    const store = setupTestStore({
      websocket: mockWebSocketState({
        status: CONNECTED,
        reconnect: { isRetrying: false, currentAttempt: 0, maxRetries: 8, nextRetryDelay: null },
      }),
    })

    const { rerender } = renderHook(() => useWebSocketNavigation(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <BrowserRouter>{children}</BrowserRouter>
        </Provider>
      ),
    })

    // First reconnect attempt
    store.dispatch({
      type: "wsconnection/reconnectAttempt",
      payload: { attempt: 1, maxRetries: 8, nextRetryDelay: 1000 },
    })
    store.dispatch({ type: "wsconnection/connectPending" })
    rerender()

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith("/reconnect", { replace: true })

    // Navigate is called, now we"re on /reconnect page
    mockLocation = { pathname: "/reconnect" }
    vi.clearAllMocks()

    // Second reconnect attempt - should not navigate again
    store.dispatch({
      type: "wsconnection/reconnectAttempt",
      payload: { attempt: 2, maxRetries: 8, nextRetryDelay: 2000 },
    })
    rerender()

    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
