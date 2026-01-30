import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { Provider } from "react-redux"
import { BrowserRouter } from "react-router"
import { CONNECTED, CONNECTING, ERROR } from "@common/src/constants"
import { useValkeyConnectionNavigation } from "../hooks/useValkeyConnectionNavigation"
import { setupTestStore } from "@/test/utils/test-utils"
import { mockConnectionState } from "@/test/utils/mocks"

// Mock react-router
const mockNavigate = vi.fn()
let mockLocation = { pathname: "/conn-1/dashboard" }
let mockParams: { id?: string } = { id: "conn-1" }

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
    useParams: () => mockParams,
  }
})

describe("useValkeyConnectionNavigation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    mockLocation = { pathname: "/conn-1/dashboard" }
    mockParams = { id: "conn-1" }
  })

  it("should not navigate if no connection id in params", () => {
    mockParams = { id: undefined }

    const store = setupTestStore({
      valkeyConnection: {
        connections: {},
      },
    })

    renderHook(() => useValkeyConnectionNavigation(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <BrowserRouter>{children}</BrowserRouter>
        </Provider>
      ),
    })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("should not navigate if connection not found in state", () => {
    mockParams = { id: "nonexistent-id" }

    const store = setupTestStore({
      valkeyConnection: {
        connections: {
          "conn-1": mockConnectionState({ status: CONNECTED }),
        },
      },
    })

    renderHook(() => useValkeyConnectionNavigation(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <BrowserRouter>{children}</BrowserRouter>
        </Provider>
      ),
    })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("should not navigate when already on /valkey-reconnect page", () => {
    mockLocation = { pathname: "/conn-1/valkey-reconnect" }

    const store = setupTestStore({
      valkeyConnection: {
        connections: {
          "conn-1": mockConnectionState({
            status: ERROR,
            reconnect: { isRetrying: true, currentAttempt: 1, maxRetries: 8 },
          }),
        },
      },
    })

    renderHook(() => useValkeyConnectionNavigation(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <BrowserRouter>{children}</BrowserRouter>
        </Provider>
      ),
    })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("should not navigate when on /connect or /settings page", () => {
    mockLocation = { pathname: "/connect" }

    const store = setupTestStore({
      valkeyConnection: {
        connections: {
          "conn-1": mockConnectionState({
            status: ERROR,
            reconnect: { isRetrying: true, currentAttempt: 1, maxRetries: 8 },
          }),
        },
      },
    })

    renderHook(() => useValkeyConnectionNavigation(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <BrowserRouter>{children}</BrowserRouter>
        </Provider>
      ),
    })

    expect(mockNavigate).not.toHaveBeenCalled()

    // Test /settings
    vi.clearAllMocks()
    mockLocation = { pathname: "/settings" }

    const { rerender } = renderHook(() => useValkeyConnectionNavigation(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <BrowserRouter>{children}</BrowserRouter>
        </Provider>
      ),
    })

    rerender()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("should navigate to valkey-reconnect when status is CONNECTING with retry", () => {
    mockLocation = { pathname: "/conn-1/keys" }

    const store = setupTestStore({
      valkeyConnection: {
        connections: {
          "conn-1": mockConnectionState({
            status: CONNECTING,
            reconnect: { isRetrying: true, currentAttempt: 1, maxRetries: 8 },
          }),
        },
      },
    })

    renderHook(() => useValkeyConnectionNavigation(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <BrowserRouter>{children}</BrowserRouter>
        </Provider>
      ),
    })

    expect(mockNavigate).toHaveBeenCalledWith("/conn-1/valkey-reconnect", { replace: true })
    expect(sessionStorage.getItem("valkey-previous-conn-1")).toBe("/conn-1/keys")
  })

  it("should navigate to valkey-reconnect when status is ERROR with retry", () => {
    mockLocation = { pathname: "/conn-1/monitoring" }

    const store = setupTestStore({
      valkeyConnection: {
        connections: {
          "conn-1": mockConnectionState({
            status: ERROR,
            errorMessage: "Connection failed",
            reconnect: { isRetrying: true, currentAttempt: 2, maxRetries: 8 },
          }),
        },
      },
    })

    renderHook(() => useValkeyConnectionNavigation(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <BrowserRouter>{children}</BrowserRouter>
        </Provider>
      ),
    })

    expect(mockNavigate).toHaveBeenCalledWith("/conn-1/valkey-reconnect", { replace: true })
    expect(sessionStorage.getItem("valkey-previous-conn-1")).toBe("/conn-1/monitoring")
  })

  it("should navigate when status is ERROR with reconnect state but not retrying", () => {
    mockLocation = { pathname: "/conn-1/cluster" }

    const store = setupTestStore({
      valkeyConnection: {
        connections: {
          "conn-1": mockConnectionState({
            status: ERROR,
            errorMessage: "Max retries exceeded",
            reconnect: { isRetrying: false, currentAttempt: 8, maxRetries: 8 },
          }),
        },
      },
    })

    renderHook(() => useValkeyConnectionNavigation(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <BrowserRouter>{children}</BrowserRouter>
        </Provider>
      ),
    })

    expect(mockNavigate).toHaveBeenCalledWith("/conn-1/valkey-reconnect", { replace: true })
    expect(sessionStorage.getItem("valkey-previous-conn-1")).toBe("/conn-1/cluster")
  })

  it("should handle multiple connections independently", () => {
    // First connection in error state
    mockParams = { id: "conn-1" }
    mockLocation = { pathname: "/conn-1/dashboard" }

    const store = setupTestStore({
      valkeyConnection: {
        connections: {
          "conn-1": mockConnectionState({
            status: ERROR,
            reconnect: { isRetrying: true, currentAttempt: 1, maxRetries: 8 },
          }),
          "conn-2": mockConnectionState({
            status: CONNECTED,
          }),
        },
      },
    })

    renderHook(() => useValkeyConnectionNavigation(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <BrowserRouter>{children}</BrowserRouter>
        </Provider>
      ),
    })

    expect(mockNavigate).toHaveBeenCalledWith("/conn-1/valkey-reconnect", { replace: true })
    expect(sessionStorage.getItem("valkey-previous-conn-1")).toBe("/conn-1/dashboard")

    // Second connection should not be affected
    vi.clearAllMocks()
    mockParams = { id: "conn-2" }
    mockLocation = { pathname: "/conn-2/dashboard" }

    renderHook(() => useValkeyConnectionNavigation(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <BrowserRouter>{children}</BrowserRouter>
        </Provider>
      ),
    })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("should not navigate if status transitions but no retry state", () => {
    mockLocation = { pathname: "/conn-1/keys" }

    const store = setupTestStore({
      valkeyConnection: {
        connections: {
          "conn-1": mockConnectionState({
            status: ERROR,
            errorMessage: "Some error",
            reconnect: undefined, // No reconnect state
          }),
        },
      },
    })

    renderHook(() => useValkeyConnectionNavigation(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <BrowserRouter>{children}</BrowserRouter>
        </Provider>
      ),
    })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("should store correct session storage key per connection", () => {
    mockParams = { id: "my-custom-connection-id" }
    mockLocation = { pathname: "/my-custom-connection-id/monitoring" }

    const store = setupTestStore({
      valkeyConnection: {
        connections: {
          "my-custom-connection-id": mockConnectionState({
            status: CONNECTING,
            reconnect: { isRetrying: true, currentAttempt: 1, maxRetries: 8 },
          }),
        },
      },
    })

    renderHook(() => useValkeyConnectionNavigation(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <BrowserRouter>{children}</BrowserRouter>
        </Provider>
      ),
    })

    expect(mockNavigate).toHaveBeenCalledWith("/my-custom-connection-id/valkey-reconnect", {
      replace: true,
    })
    expect(sessionStorage.getItem("valkey-previous-my-custom-connection-id")).toBe(
      "/my-custom-connection-id/monitoring",
    )
  })
})
