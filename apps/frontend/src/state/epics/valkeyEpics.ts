import { merge, timer, EMPTY } from "rxjs"
import { ignoreElements, tap, delay, switchMap, catchError } from "rxjs/operators"
import * as R from "ramda"
import { DISCONNECTED, LOCAL_STORAGE, NOT_CONNECTED, RETRY_CONFIG, retryDelay } from "@common/src/constants.ts"
import { toast } from "sonner"
import { getSocket } from "./wsEpics"
import { connectFulfilled, connectPending, deleteConnection, connectRejected, startRetry, stopRetry }
  from "../valkey-features/connection/connectionSlice"
import { sendRequested } from "../valkey-features/command/commandSlice"
import { setData } from "../valkey-features/info/infoSlice"
import { action$, select } from "../middleware/rxjsMiddleware/rxjsMiddlware"
import { setClusterData } from "../valkey-features/cluster/clusterSlice"
import { connectFulfilled as wsConnectFulfilled } from "../wsconnection/wsConnectionSlice"
import history from "../../history.ts"
import type { Store } from "@reduxjs/toolkit"
import { atId } from "@/state/valkey-features/connection/connectionSelectors.ts"

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
      select(connectFulfilled),
      tap(({ payload: { connectionId } }) => {
        try {
          const currentConnections = R.pipe(
            (v: string) => localStorage.getItem(v),
            (s) => (s === null ? {} : JSON.parse(s)),
          )(LOCAL_STORAGE.VALKEY_CONNECTIONS)

          R.pipe( // merge fulfilled connection with existing connections in localStorage
            atId(connectionId),
            R.evolve({ status: R.always(NOT_CONNECTED) }),
            R.assoc(connectionId, R.__, currentConnections),
            JSON.stringify,
            (updated) => localStorage.setItem(LOCAL_STORAGE.VALKEY_CONNECTIONS, updated),
          )(store.getState())
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
          const { host, port, username, password } = connection.connectionDetails
          console.log(`Attempting retry ${currentAttempt} for ${connectionId}`)

          store.dispatch(connectPending({
            connectionId,
            host,
            port,
            username,
            password,
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
          const { host, port, username, password } = connection.connectionDetails

          console.log(`Attempting to reconnect ${connectionId}`)
          store.dispatch(connectPending({
            connectionId,
            host,
            port,
            username,
            password,
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
        )(currentConnections)

        toast.success("Connection removed successfully!")
      } catch (e) {
        toast.error("Failed to remove connection!")
        console.error(e)
      }
    }),
  )

export const sendRequestEpic = () =>
  action$.pipe(
    select(sendRequested),
    tap((action) => {
      const socket = getSocket()
      socket.next(action)
    }),
  )

export const setDataEpic = () =>
  action$.pipe(
    select(connectFulfilled),
    tap((action) => {
      const socket = getSocket()
      const { clusterId, connectionId } = action.payload
      if (clusterId) {
        socket.next({ type: setClusterData.type, payload: { clusterId, connectionId } })
      }
      socket.next({ type: setData.type, payload: { connectionId } })
      const dashboardPath = clusterId
        ? `/${clusterId}/${connectionId}/dashboard`
        : `/${connectionId}/dashboard`

      history.navigate(dashboardPath)
    }),
  )
