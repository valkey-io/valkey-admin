import { merge, timer, EMPTY } from "rxjs"
import { ignoreElements, tap, delay, switchMap, mergeMap, catchError, filter, take } from "rxjs/operators"
import * as R from "ramda"
import { DISCONNECTED, LOCAL_STORAGE, NOT_CONNECTED, RETRY_CONFIG, retryDelay } from "@common/src/constants.ts"
import { toast } from "sonner"
import { sanitizeUrl } from "@common/src/url-utils"
import { getSocket } from "./wsEpics"
import {
  standaloneConnectFulfilled,
  clusterConnectFulfilled,
  connectPending,
  deleteConnection,
  connectRejected,
  startRetry,
  stopRetry,
  updateConnectionDetails,
  type ConnectionState,
  closeConnectionFulfilled,
  closeConnectionFailed,
  closeConnection
} from "../valkey-features/connection/connectionSlice"
import { sendRequested } from "../valkey-features/command/commandSlice"
import { setData } from "../valkey-features/info/infoSlice"
import { action$, select } from "../middleware/rxjsMiddleware/rxjsMiddleware.ts"
import { connectFulfilled as wsConnectFulfilled } from "../wsconnection/wsConnectionSlice"
import { hotKeysRequested } from "../valkey-features/hotkeys/hotKeysSlice.ts"
import { commandLogsRequested } from "../valkey-features/commandlogs/commandLogsSlice.ts"
import history from "../../history.ts"
import { setClusterData } from "../valkey-features/cluster/clusterSlice.ts"
import { setConfig, updateConfig, updateConfigFulfilled } from "../valkey-features/config/configSlice.ts"
import { cpuUsageRequested } from "../valkey-features/cpu/cpuSlice.ts"
import { memoryUsageRequested } from "../valkey-features/memory/memorySlice.ts"
import { secureStorage } from "../../utils/secureStorage.ts"
import { selectIsAtConnectionLimit } from "../valkey-features/connection/connectionSelectors.ts"
import type { Store } from "@reduxjs/toolkit"

const getCurrentConnections = () => R.pipe(
  (v: string) => localStorage.getItem(v),
  (s) => (s === null ? {} : JSON.parse(s)),
)(LOCAL_STORAGE.VALKEY_CONNECTIONS)

export const connectionEpic = (store: Store) =>
  merge(
    action$.pipe(
      select(connectPending),
      filter(() => !selectIsAtConnectionLimit(store.getState())),
      mergeMap(async (action) => {
        const { password } = action.payload.connectionDetails
        if (R.isNil(password)) return action
        
        const decryptedPassword = await secureStorage.decrypt(password)
        
        return R.assocPath(
          ["payload", "connectionDetails", "password"],
          decryptedPassword,
          action,
        )
      }),
      tap((action) => {
        const socket = getSocket()
        socket.next(action)
      }),
      ignoreElements(),
    ),

    action$.pipe(
      filter(
        ({ type }) =>
          type === standaloneConnectFulfilled.type ||
          type === clusterConnectFulfilled.type,
      ),
      tap(async ({ payload }) => {
        try {
          const currentConnections = getCurrentConnections()

          const state = store.getState()
          const connection = state.valkeyConnection?.connections?.[payload.connectionId]

          const baseConnectionDetails =
            connection?.connectionDetails ?? payload.connectionDetails

          const connectionToSave = {
            connectionDetails: R.isNil(R.path(["password"], baseConnectionDetails))
              ? baseConnectionDetails
              : R.assoc(
                "password",
                await secureStorage.encrypt(baseConnectionDetails.password),
                baseConnectionDetails,
              ),
            status: NOT_CONNECTED,
            connectionHistory: connection?.connectionHistory ?? [],
          }

          currentConnections[payload.connectionId] = connectionToSave
          localStorage.setItem(LOCAL_STORAGE.VALKEY_CONNECTIONS, JSON.stringify(currentConnections))

          toast.success("Connected to server successfully!")
        } catch (e) {
          toast.error("Connection to server failed!")
          console.error(e)
        }
      }),
    ),

    action$.pipe(
      select(connectRejected),
      tap(({ payload: { connectionId, errorMessage } }) => {
        console.error("Connection rejected for", connectionId, ":", errorMessage)
      }),
      ignoreElements(),
    ),

    action$.pipe(
      select(wsConnectFulfilled),
      take(1),
      tap(() => {
        const host = import.meta.env.VITE_LOCAL_VALKEY_HOST
        const port = import.meta.env.VITE_LOCAL_VALKEY_PORT
        const alias = import.meta.env.VITE_LOCAL_VALKEY_NAME

        if (host && port) {
          const connectionId = sanitizeUrl(`${host}-${port}`)

          store.dispatch(connectPending({
            connectionDetails: {
              host,
              port: String(port),
              username: "",
              password: "",
              tls: false,
              verifyTlsCertificate: false, 
              alias: alias || "Valkey Cluster",
            },
            connectionId,

          }))
        }
      }),
      ignoreElements(),
    ),
  )

// Valkey connection retry epic
export const valkeyRetryEpic = (store: Store) =>
  action$.pipe(
    select(connectRejected),
    switchMap(({ payload: { connectionId } }) => {
      const state = store.getState()
      const connection = state.valkeyConnection?.connections?.[connectionId]

      if (!connection) {
        console.log(`No connection found for ${connectionId}, skipping retry`)
        return EMPTY
      }

      // Check if this was a previously successful connection (exists in localStorage)
      const savedConnections = R.pipe(
        (v: string) => localStorage.getItem(v),
        (s) => (s === null ? {} : JSON.parse(s)),
      )(LOCAL_STORAGE.VALKEY_CONNECTIONS)

      const wasPreviouslyConnected = savedConnections[connectionId] !== undefined

      if (!wasPreviouslyConnected) {
        console.log(`First-time connection failed for ${connectionId}, not retrying`)
        return EMPTY
      }

      const currentAttempt = (connection.reconnect?.currentAttempt || 0) + 1

      // to see if we should retry
      if (currentAttempt > RETRY_CONFIG.MAX_RETRIES) {
        console.log(`Max retries reached for ${connectionId}`)
        store.dispatch(stopRetry({ connectionId }))
        toast.error("Unable to reconnect to Valkey instance")
        return EMPTY
      }

      const nextDelay = retryDelay(currentAttempt - 1)

      store.dispatch(startRetry({
        connectionId,
        attempt: currentAttempt,
        maxRetries: RETRY_CONFIG.MAX_RETRIES,
        nextRetryDelay: nextDelay,
      }))

      console.log(`Retrying connection ${connectionId} (attempt ${currentAttempt}/${RETRY_CONFIG.MAX_RETRIES}) in ${nextDelay}ms`)

      return timer(nextDelay).pipe(
        tap(() => {
          console.log(`Attempting retry ${currentAttempt} for ${connectionId}`)

          store.dispatch(connectPending({
            connectionId,
            connectionDetails: connection.connectionDetails,
            isRetry: true,
          }))
        }),
        catchError((err) => {
          console.error(`Error during retry for ${connectionId}:`, err)
          return EMPTY
        }),
        ignoreElements(),
      )
    }),
  )

// reconnect epic
export const autoReconnectEpic = (store: Store) =>
  action$.pipe(
    select(wsConnectFulfilled),
    delay(500), // Small delay to ensure WebSocket is fully connected
    tap(() => {
      const state = store.getState()
      const connections: Record<string, ConnectionState> = state.valkeyConnection?.connections || {}

      const disconnectedConnections = Object.entries(connections)
        .filter(([, connection]) => connection.status === DISCONNECTED)

      if (disconnectedConnections.length > 0) {
        console.log(`Auto-reconnecting ${disconnectedConnections.length} connection(s)`)
        toast.info(`Reconnecting ${disconnectedConnections.length} connection(s)...`)

        // reconnect each disconnected connection
        disconnectedConnections.forEach(([connectionId, connection]) => {
          console.log(`Attempting to reconnect ${connectionId}`)
          store.dispatch(connectPending({
            connectionId,
            connectionDetails: connection.connectionDetails,
          }))
        })
      }
    }),
    ignoreElements(),
  )

export const deleteConnectionEpic = () =>
  merge (
    action$.pipe(
      select(deleteConnection),
      tap((action) => {
        const { connectionId, silent } = action.payload
        try {
          const currentConnections = getCurrentConnections()
          R.pipe(
            R.dissoc(connectionId),
            JSON.stringify,
            (updated) => localStorage.setItem(LOCAL_STORAGE.VALKEY_CONNECTIONS, updated),
          )(currentConnections)
        } catch (e) {
          if (!silent) {
            toast.error("Failed to remove connection!")
          }
          console.error(e)
        }
        const socket = getSocket()
        socket.next({ type: closeConnection.type, payload: action.payload })
      }),
    ),
    action$.pipe(
      select(closeConnection),
      tap((action) => {
        const socket = getSocket()
        socket.next(action)
      }),
    ),
    action$.pipe(
      select(closeConnectionFulfilled),
      tap((action) => {
        const { silent } = action.payload!
        if (!silent) {
          toast.success("Connection closed successfully!")
        }

      }),
    ),
    action$.pipe(
      select(closeConnectionFailed),
      tap((action) => {
        toast.error("Failed to close connection: ", action.payload.errorMessage)
      }),
    ),
  )

// for updating connection details: this will persist the edits
export const updateConnectionDetailsEpic = (store: Store) =>
  action$.pipe(
    select(updateConnectionDetails),
    tap(async ({ payload: { connectionId } }) => {
      try {
        const currentConnections = getCurrentConnections()

        const state = store.getState()
        const connection = state.valkeyConnection?.connections?.[connectionId]

        if (connection && currentConnections[connectionId]) {
          const connectionDetails = connection.connectionDetails.password
            ? R.assoc(
              "password",
              await secureStorage.encrypt(connection.connectionDetails.password),
              connection.connectionDetails,
            )
            : connection.connectionDetails
          
          currentConnections[connectionId].connectionDetails = connectionDetails
          currentConnections[connectionId].connectionHistory = connection.connectionHistory || []
          localStorage.setItem(LOCAL_STORAGE.VALKEY_CONNECTIONS, JSON.stringify(currentConnections))
        }
      } catch (e) {
        console.error(e)
      }
    }),
    ignoreElements(),
  )

export const sendRequestEpic = () =>
  action$.pipe(
    select(sendRequested),
    tap((action) => {
      const socket = getSocket()
      socket.next(action)
    }),
  )

export const setDataEpic = (store: Store) =>
  action$.pipe(
    filter(
      ({ type }) =>
        type === standaloneConnectFulfilled.type ||
          type === clusterConnectFulfilled.type,
    ),
    tap((action) => {
      const socket = getSocket()

      const { clusterId, connectionId } = action.payload as unknown as {clusterId:string, connectionId:string}
      store.dispatch(setConfig( action.payload))
      if (action.type === clusterConnectFulfilled.type) {
        socket.next({ type: setClusterData.type, payload: { clusterId, connectionId } })
      }

      socket.next({ type: setData.type, payload: action.payload })
      const dashboardPath = clusterId
        ? `/${clusterId}/${connectionId}/dashboard`
        : `/${connectionId}/dashboard`

      history.navigate(dashboardPath)
    }),
  )

export const getHotKeysEpic = (store: Store) =>
  action$.pipe(
    select(hotKeysRequested),
    tap((action) => {
      const { connectionId, clusterId } = action.payload
      const socket = getSocket()
      const state = store.getState()
      const connection = state.valkeyConnection.connections[connectionId]
      const monitorEnabled = state.config[connectionId].monitoring.monitorEnabled
      const lfuEnabled = connection.connectionDetails.keyEvictionPolicy.includes("lfu") ?? false
      const clusterSlotStatsEnabled = connection.connectionDetails.clusterSlotStatsEnabled ?? false

      socket.next({
        type: action.type,
        payload: { connectionId, clusterId, lfuEnabled, clusterSlotStatsEnabled, monitorEnabled },
      })

    }),
  )

export const getCommandLogsEpic = () =>
  action$.pipe(
    select(commandLogsRequested),
    tap((action) => {
      try {
        const { commandLogType, connectionId, clusterId } = action.payload
        const socket = getSocket()
        socket.next({
          type: action.type,
          payload: { connectionId, clusterId, commandLogType },
        })
      } catch (error) {
        console.error("[getCommandLogsEpic] Error sending action:", error)
      }
    }),
    ignoreElements(),
  )

export const updateConfigEpic = () =>
  action$.pipe(
    select(updateConfig),
    tap((action) => {
      const { config, connectionId, clusterId } = action.payload
      const socket = getSocket()
      socket.next({ type: action.type, payload: { connectionId, clusterId, config } })
    }),
  )

// TODO: Add frontend component to dispatch this
export const enableClusterSlotStatsEpic = () =>
  action$.pipe(
    select(updateConfigFulfilled),
    tap((action) => {
      const { clusterId, connectionId } = action.payload
      const socket = getSocket()
      socket.next({ type: "config/enableClusterSlotStats", payload: { connectionId, clusterId } })
    }),
  )

export const getCpuUsageEpic = () =>
  action$.pipe(
    select(cpuUsageRequested),
    tap((action) => {
      try {
        const { timeRange, connectionId, clusterId } = action.payload
        const socket = getSocket()

        socket.next({
          type: action.type,
          payload: { connectionId, clusterId, timeRange },
        })
      } catch (error) {
        console.error("[getCpuUsageEpic] Error sending action:", error)
      }
    }),
    ignoreElements(),
  )

export const getMemoryUsageEpic = () =>
  action$.pipe(
    select(memoryUsageRequested),
    tap((action) => {
      try {
        const { timeRange, connectionId, clusterId } = action.payload
        const socket = getSocket()

        socket.next({
          type: action.type,
          payload: { connectionId, timeRange, clusterId },
        })
      } catch (error) {
        console.error("[getMemoryUsageEpic] Error sending action:", error)
      }
    }),
    ignoreElements(),
  )
