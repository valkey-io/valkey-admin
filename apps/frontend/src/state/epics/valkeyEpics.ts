import { merge, timer, EMPTY } from "rxjs"
import { ignoreElements, tap, delay, switchMap, catchError, filter, take } from "rxjs/operators"
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
  updateConnectionDetails
} from "../valkey-features/connection/connectionSlice"
import { sendRequested } from "../valkey-features/command/commandSlice"
import { setData } from "../valkey-features/info/infoSlice"
import { action$, select } from "../middleware/rxjsMiddleware/rxjsMiddlware"
import { connectFulfilled as wsConnectFulfilled } from "../wsconnection/wsConnectionSlice"
import { hotKeysRequested } from "../valkey-features/hotkeys/hotKeysSlice.ts"
import { commandLogsRequested } from "../valkey-features/commandlogs/commandLogsSlice.ts"
import history from "../../history.ts"
import { setClusterData } from "../valkey-features/cluster/clusterSlice.ts"
import { setConfig, updateConfig, updateConfigFulfilled } from "../valkey-features/config/configSlice.ts"
import type { PayloadAction, Store } from "@reduxjs/toolkit"

const getConnectionIds = (store: Store, action) => {
  // If we're connected to a cluster, pass connectionId of each node
  // Else pass connectionId of current node only
  const { clusterId, connectionId } = action.payload
  const state = store.getState()
  const clusters = state.valkeyCluster.clusters
      
  return clusterId !== undefined
    ? Object.keys(clusters[clusterId].clusterNodes)
    : [connectionId]

}
export const connectionEpic = (store: Store) =>
  merge(
    action$.pipe(
      select(connectPending),
      tap((action) => {
        const socket = getSocket()
        console.log("Sending message to server from connecting epic...")
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
      tap(({ payload }) => {
        try {
          const currentConnections = R.pipe(
            (v: string) => localStorage.getItem(v),
            (s) => (s === null ? {} : JSON.parse(s)),
          )(LOCAL_STORAGE.VALKEY_CONNECTIONS)

          // for getting the full connection state from redux (which includes alias)
          const state = store.getState()
          const connection = state.valkeyConnection?.connections?.[payload.connectionId]

          R.pipe(
            (p) => ({
              connectionDetails: connection?.connectionDetails || p.connectionDetails,
              status: NOT_CONNECTED,
              connectionHistory: connection?.connectionHistory || [],
            }),
            (connectionToSave) => ({ ...currentConnections, [payload.connectionId]: connectionToSave }),
            JSON.stringify,
            (updated) => localStorage.setItem(LOCAL_STORAGE.VALKEY_CONNECTIONS, updated),
          )(payload)

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
            host,
            port: String(port),
            username: "",
            password: "",
            alias: alias || "Local Valkey Cluster",
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
          const { host, port, username, password, alias } = connection.connectionDetails
          console.log(`Attempting retry ${currentAttempt} for ${connectionId}`)

          store.dispatch(connectPending({
            connectionId,
            host,
            port,
            username,
            password,
            alias,
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
      const connections = state.valkeyConnection?.connections || {}

      // disconnected Valkey connections
      const disconnectedConnections = Object.entries(connections)
        .filter(([, connection]) => connection.status === DISCONNECTED)

      if (disconnectedConnections.length > 0) {
        console.log(`Auto-reconnecting ${disconnectedConnections.length} connection(s)`)
        toast.info(`Reconnecting ${disconnectedConnections.length} connection(s)...`)

        // reconnect each disconnected connection
        disconnectedConnections.forEach(([connectionId, connection]) => {
          const { host, port, username, password, alias } = connection.connectionDetails

          console.log(`Attempting to reconnect ${connectionId}`)
          store.dispatch(connectPending({
            connectionId,
            host,
            port,
            username,
            password,
            alias,
          }))
        })
      }
    }),
    ignoreElements(),
  )

export const deleteConnectionEpic = () =>
  action$.pipe(
    select(deleteConnection),
    // TODO: extract reused logic into separate method
    tap(({ payload: { connectionId } }) => {
      try {
        const currentConnections = R.pipe(
          (v: string) => localStorage.getItem(v),
          (s) => (s === null ? {} : JSON.parse(s)),
        )(LOCAL_STORAGE.VALKEY_CONNECTIONS)
        R.pipe(
          R.dissoc(connectionId),
          JSON.stringify,
          (updated) => localStorage.setItem(LOCAL_STORAGE.VALKEY_CONNECTIONS, updated),
          () => toast.success("Connection removed successfully!"),
        )(currentConnections)
      } catch (e) {
        toast.error("Failed to remove connection!")
        console.error(e)
      }
    }),
  )

// for updating connection details: this will presist the edits
export const updateConnectionDetailsEpic = (store: Store) =>
  action$.pipe(
    select(updateConnectionDetails),
    tap(({ payload: { connectionId } }) => {
      try {
        const currentConnections = R.pipe(
          (v: string) => localStorage.getItem(v),
          (s) => (s === null ? {} : JSON.parse(s)),
        )(LOCAL_STORAGE.VALKEY_CONNECTIONS)

        const state = store.getState()
        const connection = state.valkeyConnection?.connections?.[connectionId]

        if (connection && currentConnections[connectionId]) {
          currentConnections[connectionId].connectionDetails = connection.connectionDetails
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
    tap((action: PayloadAction) => {
      const socket = getSocket()

      const { clusterId, connectionId } = action.payload 
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
      const { connectionId } = action.payload
      const socket = getSocket()
      const connectionIds = getConnectionIds(store, action)

      const state = store.getState()
      const connection = state.valkeyConnection.connections[connectionId]
      const monitorEnabled = state.config[connectionId].monitoring.monitorEnabled
      const lfuEnabled = connection.connectionDetails.keyEvictionPolicy.includes("lfu") ?? false
      const clusterSlotStatsEnabled = connection.connectionDetails.clusterSlotStatsEnabled ?? false

      socket.next({
        type: action.type,
        payload: { connectionIds, lfuEnabled, clusterSlotStatsEnabled, monitorEnabled },
      })

    }),
  )

export const getCommandLogsEpic = (store: Store) =>
  action$.pipe(
    select(commandLogsRequested),
    tap((action) => {
      try {
        const { commandLogType } = action.payload
        const socket = getSocket()
        const connectionIds = getConnectionIds(store, action)

        socket.next({
          type: action.type,
          payload: { connectionIds, commandLogType },
        })
      } catch (error) {
        console.error("[getCommandLogsEpic] Error sending action:", error)
      }
    }),
    ignoreElements(),
  )

export const updateConfigEpic = (store: Store) => 
  action$.pipe(
    select(updateConfig),
    tap((action) => {
      const {  config } = action.payload
      const socket = getSocket()
      const connectionIds = getConnectionIds(store, action)
      socket.next({ type: action.type, payload: { connectionIds, config } })
    }),
  )

// TODO: Add frontend component to dispatch this
export const enableClusterSlotStatsEpic = (store: Store) =>
  action$.pipe(
    select(updateConfigFulfilled),
    tap((action) => {
      const socket = getSocket()
      const connectionIds = getConnectionIds(store, action)
      socket.next({ type: "config/enableClusterSlotStats", payload: { connectionIds } })
    }),
  )
  
