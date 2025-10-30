import { webSocket, WebSocketSubject } from "rxjs/webSocket"
import { of, EMPTY, merge, timer } from "rxjs"
import {
  catchError,
  mergeMap,
  tap,
  ignoreElements,
  filter,
  switchMap,
  retry
} from "rxjs/operators"
import { CONNECTED, VALKEY, WS_RETRY_CONFIG, retryDelay } from "@common/src/constants.ts"
import { action$ } from "../middleware/rxjsMiddleware/rxjsMiddlware"
import type { PayloadAction, Store } from "@reduxjs/toolkit"
import { connectionBroken } from "@/state/valkey-features/connection/connectionSlice"
import {
  connectFulfilled,
  connectPending,
  connectRejected,
  reconnectAttempt,
  reconnectExhausted
} from "@/state/wsconnection/wsConnectionSlice"

let socket$: WebSocketSubject<PayloadAction> | null = null

const connect = (store: Store) =>
  action$.pipe(
    filter((action) => action.type === connectPending.type),
    mergeMap(() => {
      if (socket$) {
        return EMPTY
      }
      // Create new WebSocket instance - required for retry logic to work
      const createSocket = () => {
        socket$ = webSocket({
          url: "ws://localhost:8080",
          deserializer: (message) => JSON.parse(message.data),
          serializer: (message) => JSON.stringify(message),
          openObserver: {
            next: () => {
              console.log("Socket Connection opened")
              store.dispatch(connectFulfilled())
            },
          },
          closeObserver: {
            next: (event) => {
              console.log("Socket Connection closed", event)
              const state = store.getState()
              const connections = state[VALKEY.CONNECTION.name]?.connections || {}

              // Mark all connected Valkey connections as broken
              Object.keys(connections).forEach((connectionId) => {
                if (connections[connectionId].status === CONNECTED) {
                  console.log(`Dispatching connectionBroken for ${connectionId}`)
                  store.dispatch(connectionBroken({ connectionId }))
                }
              })
              socket$ = null
            },
          },
        })
        return socket$
      }

      return of(null).pipe(
        mergeMap(() => {
          const socket = createSocket()
          return socket.pipe(ignoreElements())
        }),
        retry({
          count: WS_RETRY_CONFIG.MAX_RETRIES,
          delay: (error, retryCount) => {
            console.error(`WebSocket error (attempt ${retryCount}):`, error)

            const delay = retryDelay(retryCount - 1)

            store.dispatch(reconnectAttempt({
              attempt: retryCount,
              maxRetries: WS_RETRY_CONFIG.MAX_RETRIES,
              nextRetryDelay: delay,
            }))

            return timer(delay)
          },
          resetOnSuccess: true,
        }),
        catchError((err) => {
          console.error("WebSocket connection failed permanently:", err)
          store.dispatch(reconnectExhausted())
          store.dispatch(connectRejected(err))
          return EMPTY
        }),
      )
    }),
  )

const emitActions = (store: Store) =>
  action$.pipe(
    filter((action) => action.type === connectFulfilled.type),
    switchMap(() => {
      if (!socket$) {
        console.warn("Tried to subscribe to socket messages, but socket is null")
        return EMPTY
      }

      return socket$.pipe(
        tap((message) => {
          console.log("[WebSocket] Incoming message:", message)
          store.dispatch(message)
        }),
        catchError((err) => {
          console.error("WebSocket error in message stream:", err)
          const state = store.getState()
          const connections = state[VALKEY.CONNECTION.name]?.connections || {}

          Object.keys(connections).forEach((connectionId) => {
            if (connections[connectionId].status === CONNECTED) {
              store.dispatch(connectionBroken({ connectionId }))
            }
          })

          // trigger reconnection
          store.dispatch(connectPending())
          return EMPTY
        }),
        ignoreElements(),
      )
    }),
  )

export function getSocket(): WebSocketSubject<PayloadAction> {
  if (!socket$) {
    throw new Error("WebSocket is not connected")
  }
  return socket$
}

export const wsConnectionEpic = (store: Store) => merge(
  connect(store),
  emitActions(store),
)
