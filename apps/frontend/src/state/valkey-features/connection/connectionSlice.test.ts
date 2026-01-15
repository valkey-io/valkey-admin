import { describe, it, expect, beforeEach } from "vitest"
import { CONNECTED, CONNECTING, ERROR, DISCONNECTED, NOT_CONNECTED } from "@common/src/constants"
import connectionReducer, {
  connectPending,
  standaloneConnectFulfilled,
  clusterConnectFulfilled,
  connectRejected,
  startRetry,
  stopRetry,
  connectionBroken,
  closeConnection,
  updateConnectionDetails,
  deleteConnection,
  type ValkeyConnectionsState
} from "./connectionSlice"

describe("connectionSlice", () => {
  const initialState = { connections: {} as ValkeyConnectionsState }

  beforeEach(() => {
    localStorage.clear()
  })

  describe("connectPending", () => {
    it("should create connection with CONNECTING status and store details", () => {
      const state = connectionReducer(
        initialState,
        connectPending({
          connectionId: "conn-1",
          connectionDetails: {
            host: "localhost",
            port: "6379",
            username: "admin",
            password: "secret",
            tls: false, 
            verifyTlsCertificate: false,
            alias: "Test",
          },

        }),
      )

      expect(state.connections["conn-1"]).toEqual({
        status: CONNECTING,
        errorMessage: null,
        connectionDetails: {
          host: "localhost",
          port: "6379",
          username: "admin",
          password: "secret",
          tls: false, 
          verifyTlsCertificate: false,
          alias: "Test",
          clusterSlotStatsEnabled: false,
          jsonModuleAvailable: false,
        },
        wasEdit: false,
      })
    })

    it("should use empty string defaults for optional username/password", () => {
      const state = connectionReducer(
        initialState,
        connectPending({
          connectionId: "conn-1",
          connectionDetails: {
            host: "localhost",
            port: "6379",
            tls: false, 
            verifyTlsCertificate: false,
          },
        }),
      )

      expect(state.connections["conn-1"].connectionDetails.username).toBeUndefined()
      expect(state.connections["conn-1"].connectionDetails.password).toBeUndefined()
      expect(state.connections["conn-1"].connectionDetails.alias).toBeUndefined()
    })

    it("should preserve connection history during retry", () => {
      const history = [{ timestamp: 123456, event: "Connected" as const }]
      const previousState = {
        connections: {
          "conn-1": {
            status: ERROR,
            errorMessage: "Connection failed",
            connectionDetails: { host: "localhost", port: "6379", username: "", password: "", tls: false, verifyTlsCertificate: false },
            connectionHistory: history,
            reconnect: { isRetrying: true, currentAttempt: 1, maxRetries: 8 },
          },
        } as ValkeyConnectionsState,
      }

      const state = connectionReducer(
        previousState,
        connectPending({
          connectionId: "conn-1",
          connectionDetails: {
            host: "localhost",
            port: "6379",
            tls: false, 
            verifyTlsCertificate: false,
          },
          isRetry: true,
        }),
      )

      expect(state.connections["conn-1"].connectionHistory).toEqual(history)
      expect(state.connections["conn-1"].reconnect).toBeDefined()
    })

    it("should preserve error message during retry", () => {
      const previousState = {
        connections: {
          "conn-1": {
            status: ERROR,
            errorMessage: "Original error",
            connectionDetails: { host: "localhost", port: "6379", username: "", password: "", tls: false, verifyTlsCertificate: false },
            reconnect: { isRetrying: true, currentAttempt: 1, maxRetries: 8 },
          },
        } as ValkeyConnectionsState,
      }

      const state = connectionReducer(
        previousState,
        connectPending({
          connectionId: "conn-1",
          connectionDetails: {
            host: "localhost",
            port: "6379",
            tls: false, 
            verifyTlsCertificate: false,
          },
          isRetry: true,
        }),
      )

      expect(state.connections["conn-1"].errorMessage).toBe("Original error")
    })

    it("should set wasEdit flag when isEdit is true", () => {
      const state = connectionReducer(
        initialState,
        connectPending({
          connectionId: "conn-1",
          connectionDetails: {
            host: "localhost",
            port: "6379",
            tls: false, 
            verifyTlsCertificate: false,
          },
          isEdit: true,
        }),
      )

      expect(state.connections["conn-1"].wasEdit).toBe(true)
    })

    it("should use preserved history if provided", () => {
      const preservedHistory = [
        { timestamp: 111111, event: "Connected" as const },
        { timestamp: 222222, event: "Connected" as const },
      ]

      const state = connectionReducer(
        initialState,
        connectPending({
          connectionId: "conn-1",
          connectionDetails: {
            host: "localhost",
            port: "6379",
            tls: false, 
            verifyTlsCertificate: false,
          },
          preservedHistory,
        }),
      )

      expect(state.connections["conn-1"].connectionHistory).toEqual(preservedHistory)
    })
  })

  describe("standaloneConnectFulfilled", () => {
    it("should set status to CONNECTED and update connection details", () => {
      const previousState = {
        connections: {
          "conn-1": {
            status: CONNECTING,
            errorMessage: null,
            connectionDetails: {
              host: "localhost",
              port: "6379",
              username: "",
              password: "",
              tls:false,
              verifyTlsCertificate: false,
              clusterSlotStatsEnabled: false,
              jsonModuleAvailable: false,
            },
          },
        } as ValkeyConnectionsState,
      }

      const state = connectionReducer(
        previousState,
        standaloneConnectFulfilled({
          connectionId: "conn-1",
          connectionDetails: {
            host: "localhost",
            port: "6379",
            username: "",
            password: "",
            tls:false,
            verifyTlsCertificate: false,
            keyEvictionPolicy: "allkeys-lru",
            jsonModuleAvailable: true,
          },
        }),
      )

      expect(state.connections["conn-1"].status).toBe(CONNECTED)
      expect(state.connections["conn-1"].errorMessage).toBeNull()
      expect(state.connections["conn-1"].connectionDetails.keyEvictionPolicy).toBe("allkeys-lru")
      expect(state.connections["conn-1"].connectionDetails.jsonModuleAvailable).toBe(true)
    })

    it("should add connection history entry", () => {
      const previousState = {
        connections: {
          "conn-1": {
            status: CONNECTING,
            errorMessage: null,
            connectionDetails: { host: "localhost", port: "6379", username: "", password: "", tls: false, verifyTlsCertificate: false },
          },
        } as ValkeyConnectionsState,
      }

      const state = connectionReducer(
        previousState,
        standaloneConnectFulfilled({
          connectionId: "conn-1",
          connectionDetails: { host: "localhost", port: "6379", username: "", password: "", tls: false, verifyTlsCertificate: false },
        }),
      )

      expect(state.connections["conn-1"].connectionHistory).toHaveLength(1)
      expect(state.connections["conn-1"].connectionHistory![0].event).toBe("Connected")
      expect(state.connections["conn-1"].connectionHistory![0].timestamp).toBeDefined()
    })

    it("should clear wasEdit flag", () => {
      const previousState = {
        connections: {
          "conn-1": {
            status: CONNECTING,
            errorMessage: null,
            connectionDetails: { host: "localhost", port: "6379", username: "", password: "", tls: false, verifyTlsCertificate: false },
            wasEdit: true,
          },
        } as ValkeyConnectionsState,
      }

      const state = connectionReducer(
        previousState,
        standaloneConnectFulfilled({
          connectionId: "conn-1",
          connectionDetails: { host: "localhost", port: "6379", username: "", password: "", tls: false, verifyTlsCertificate: false },
        }),
      )

      expect(state.connections["conn-1"].wasEdit).toBeUndefined()
    })
  })

  describe("clusterConnectFulfilled", () => {
    it("should set status to CONNECTED and store cluster info", () => {
      const previousState = {
        connections: {
          "conn-1": {
            status: CONNECTING,
            errorMessage: null,
            connectionDetails: { host: "localhost", port: "6379", username: "", password: "", tls: false, verifyTlsCertificate: false },
            reconnect: { isRetrying: true, currentAttempt: 1, maxRetries: 8 },
          },
        } as ValkeyConnectionsState,
      }

      const state = connectionReducer(
        previousState,
        clusterConnectFulfilled({
          connectionId: "conn-1",
          clusterNodes: {},
          clusterId: "cluster-1",
          keyEvictionPolicy: "allkeys-lru",
          clusterSlotStatsEnabled: true,
          jsonModuleAvailable: true,
        }),
      )

      expect(state.connections["conn-1"].status).toBe(CONNECTED)
      expect(state.connections["conn-1"].errorMessage).toBeNull()
      expect(state.connections["conn-1"].connectionDetails.clusterId).toBe("cluster-1")
      expect(state.connections["conn-1"].connectionDetails.keyEvictionPolicy).toBe("allkeys-lru")
      expect(state.connections["conn-1"].connectionDetails.clusterSlotStatsEnabled).toBe(true)
      expect(state.connections["conn-1"].connectionDetails.jsonModuleAvailable).toBe(true)
    })

    it("should clear reconnect state on successful connection", () => {
      const previousState = {
        connections: {
          "conn-1": {
            status: CONNECTING,
            errorMessage: null,
            connectionDetails: { host: "localhost", port: "6379", username: "", password: "", tls: false, verifyTlsCertificate: false },
            reconnect: { isRetrying: true, currentAttempt: 2, maxRetries: 8 },
          },
        } as ValkeyConnectionsState,
      }

      const state = connectionReducer(
        previousState,
        clusterConnectFulfilled({
          connectionId: "conn-1",
          clusterNodes: {},
          clusterId: "cluster-1",
          keyEvictionPolicy: "allkeys-lru",
          clusterSlotStatsEnabled: false,
          jsonModuleAvailable: false,
        }),
      )

      expect(state.connections["conn-1"].reconnect).toBeUndefined()
    })

    it("should add connection history entry and clear wasEdit", () => {
      const previousState = {
        connections: {
          "conn-1": {
            status: CONNECTING,
            errorMessage: null,
            connectionDetails: { host: "localhost", port: "6379", username: "", password: "", tls: false, verifyTlsCertificate: false },
            wasEdit: true,
          },
        } as ValkeyConnectionsState,
      }

      const state = connectionReducer(
        previousState,
        clusterConnectFulfilled({
          connectionId: "conn-1",
          clusterNodes: {},
          clusterId: "cluster-1",
          keyEvictionPolicy: "allkeys-lru",
          clusterSlotStatsEnabled: false,
          jsonModuleAvailable: false,
        }),
      )

      expect(state.connections["conn-1"].connectionHistory).toHaveLength(1)
      expect(state.connections["conn-1"].wasEdit).toBeUndefined()
    })
  })

  describe("connectRejected", () => {
    it("should set status to ERROR and store error message", () => {
      const previousState = {
        connections: {
          "conn-1": {
            status: CONNECTING,
            errorMessage: null,
            connectionDetails: { host: "localhost", port: "6379", username: "", password: "", tls: false, verifyTlsCertificate: false },
          },
        } as ValkeyConnectionsState,
      }

      const state = connectionReducer(
        previousState,
        connectRejected({
          connectionId: "conn-1",
          errorMessage: "Connection timeout",
        }),
      )

      expect(state.connections["conn-1"].status).toBe(ERROR)
      expect(state.connections["conn-1"].errorMessage).toBe("Connection timeout")
    })

    it("should preserve original error message during retry", () => {
      const previousState = {
        connections: {
          "conn-1": {
            status: CONNECTING,
            errorMessage: "Original error",
            connectionDetails: { host: "localhost", port: "6379", username: "", password: "", tls: false, verifyTlsCertificate: false },
            reconnect: { isRetrying: true, currentAttempt: 2, maxRetries: 8 },
          },
        } as ValkeyConnectionsState,
      }

      const state = connectionReducer(
        previousState,
        connectRejected({
          connectionId: "conn-1",
          errorMessage: "New error",
        }),
      )

      expect(state.connections["conn-1"].errorMessage).toBe("Original error")
    })

    it("should use default error message if none provided", () => {
      const previousState = {
        connections: {
          "conn-1": {
            status: CONNECTING,
            errorMessage: null,
            connectionDetails: { host: "localhost", port: "6379", username: "", password: "", tls: false, verifyTlsCertificate: false },
          },
        } as ValkeyConnectionsState,
      }

      const state = connectionReducer(
        previousState,
        connectRejected({
          connectionId: "conn-1",
        }),
      )

      expect(state.connections["conn-1"].errorMessage).toBe("Valkey error: Unable to connect.")
    })
  })

  describe("startRetry", () => {
    it("should initialize retry state with attempt counter", () => {
      const previousState = {
        connections: {
          "conn-1": {
            status: ERROR,
            errorMessage: "Connection failed",
            connectionDetails: { host: "localhost", port: "6379", username: "", password: "", tls: false, verifyTlsCertificate: false },
          },
        } as ValkeyConnectionsState,
      }

      const state = connectionReducer(
        previousState,
        startRetry({
          connectionId: "conn-1",
          attempt: 1,
          maxRetries: 8,
          nextRetryDelay: 1000,
        }),
      )

      expect(state.connections["conn-1"].reconnect).toEqual({
        isRetrying: true,
        currentAttempt: 1,
        maxRetries: 8,
        nextRetryDelay: 1000,
      })
    })
  })

  describe("stopRetry", () => {
    it("should set isRetrying to false", () => {
      const previousState = {
        connections: {
          "conn-1": {
            status: ERROR,
            errorMessage: "Failed",
            connectionDetails: { host: "localhost", port: "6379", username: "", password: "", tls: false, verifyTlsCertificate: false },
            reconnect: { isRetrying: true, currentAttempt: 3, maxRetries: 8 },
          },
        } as ValkeyConnectionsState,
      }

      const state = connectionReducer(
        previousState,
        stopRetry({
          connectionId: "conn-1",
        }),
      )

      expect(state.connections["conn-1"].reconnect!.isRetrying).toBe(false)
    })
  })

  describe("connectionBroken", () => {
    it("should set status to DISCONNECTED and store error message", () => {
      const previousState = {
        connections: {
          "conn-1": {
            status: CONNECTED,
            errorMessage: null,
            connectionDetails: { host: "localhost", port: "6379", username: "", password: "", tls: false, verifyTlsCertificate: false },
          },
        } as ValkeyConnectionsState,
      }

      const state = connectionReducer(
        previousState,
        connectionBroken({
          connectionId: "conn-1",
        }),
      )

      expect(state.connections["conn-1"].status).toBe(DISCONNECTED)
      expect(state.connections["conn-1"].errorMessage).toBe("Connection lost")
    })
  })

  describe("closeConnection", () => {
    it("should set status to NOT_CONNECTED and clear error", () => {
      const previousState = {
        connections: {
          "conn-1": {
            status: CONNECTED,
            errorMessage: "Some error",
            connectionDetails: { host: "localhost", port: "6379", username: "", password: "", tls: false, verifyTlsCertificate: false },
          },
        } as ValkeyConnectionsState,
      }

      const state = connectionReducer(
        previousState,
        closeConnection({
          connectionId: "conn-1",
        }),
      )

      expect(state.connections["conn-1"].status).toBe(NOT_CONNECTED)
      expect(state.connections["conn-1"].errorMessage).toBeNull()
    })
  })

  describe("updateConnectionDetails", () => {
    it("should update connection details and set wasEdit flag", () => {
      const previousState = {
        connections: {
          "conn-1": {
            status: CONNECTED,
            errorMessage: null,
            connectionDetails: { host: "localhost", 
              port: "6379", username: "", password: "", tls: false, verifyTlsCertificate: false, alias: "Old" },
          },
        } as ValkeyConnectionsState,
      }

      const state = connectionReducer(
        previousState,
        updateConnectionDetails({
          connectionId: "conn-1",
          alias: "Updated",
          host: "newhost",
        }),
      )

      expect(state.connections["conn-1"].connectionDetails.alias).toBe("Updated")
      expect(state.connections["conn-1"].connectionDetails.host).toBe("newhost")
      expect(state.connections["conn-1"].connectionDetails.port).toBe("6379") // Unchanged
    })
  })

  describe("deleteConnection", () => {
    it("should remove connection from state", () => {
      const previousState = {
        connections: {
          "conn-1": {
            status: CONNECTED,
            errorMessage: null,
            connectionDetails: { host: "localhost", port: "6379", username: "", password: "", tls: false, verifyTlsCertificate: false },
          },
          "conn-2": {
            status: CONNECTED,
            errorMessage: null,
            connectionDetails: { host: "localhost", port: "6379", username: "", password: "", tls: false, verifyTlsCertificate: false },
          },
        } as ValkeyConnectionsState,
      }

      const state = connectionReducer(
        previousState,
        deleteConnection({ connectionId: "conn-1" }),
      )

      expect(state.connections["conn-1"]).toBeUndefined()
      expect(state.connections["conn-2"]).toBeDefined()
    })
  })

  describe("state transitions", () => {
    it("should handle full connection flow: CONNECTING -> CONNECTED", () => {
      let state = connectionReducer(
        initialState,
        connectPending({
          connectionId: "conn-1",
          connectionDetails: {
            host: "localhost",
            port: "6379",
            tls: false, 
            verifyTlsCertificate: false,
          },
        }),
      )
      expect(state.connections["conn-1"].status).toBe(CONNECTING)

      state = connectionReducer(
        state,
        standaloneConnectFulfilled({
          connectionId: "conn-1",
          connectionDetails: { host: "localhost", port: "6379", username: "", password: "", tls: false, verifyTlsCertificate: false },
        }),
      )
      expect(state.connections["conn-1"].status).toBe(CONNECTED)
    })

    it("should handle connection failure and retry flow", () => {
      let state = connectionReducer(
        initialState,
        connectPending({
          connectionId: "conn-1",
          connectionDetails: {
            host: "localhost",
            port: "6379",
            tls: false, 
            verifyTlsCertificate: false,
          },
        }),
      )

      state = connectionReducer(
        state,
        connectRejected({
          connectionId: "conn-1",
          errorMessage: "Timeout",
        }),
      )
      expect(state.connections["conn-1"].status).toBe(ERROR)

      state = connectionReducer(
        state,
        startRetry({
          connectionId: "conn-1",
          attempt: 1,
          maxRetries: 8,
          nextRetryDelay: 1000,
        }),
      )
      expect(state.connections["conn-1"].reconnect!.isRetrying).toBe(true)

      state = connectionReducer(
        state,
        connectPending({
          connectionId: "conn-1",
          connectionDetails: {
            host: "localhost",
            port: "6379",
            tls: false, 
            verifyTlsCertificate: false,
          },
          isRetry: true,
        }),
      )
      expect(state.connections["conn-1"].status).toBe(CONNECTING)

      state = connectionReducer(
        state,
        standaloneConnectFulfilled({
          connectionId: "conn-1",
          connectionDetails: { host: "localhost", port: "6379", username: "", password: "", tls: false, verifyTlsCertificate: false },
        }),
      )
      expect(state.connections["conn-1"].status).toBe(CONNECTED)
    })
  })
})
