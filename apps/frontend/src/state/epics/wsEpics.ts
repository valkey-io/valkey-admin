import { webSocket, WebSocketSubject } from "rxjs/webSocket"
import { of, EMPTY, merge } from "rxjs"
import {
  catchError,
  mergeMap,
  tap,
  ignoreElements,
  filter,
  switchMap
} from "rxjs/operators"
import { CONNECTED, VALKEY } from "@common/src/constants.ts"
import { toast } from "sonner"
import { action$ } from "../middleware/rxjsMiddleware/rxjsMiddlware"
import type { PayloadAction, Store } from "@reduxjs/toolkit"
import { connectionBroken } from "@/state/valkey-features/connection/connectionSlice"
import {
  connectFulfilled,
  connectPending,
  connectRejected
} from "@/state/wsconnection/wsConnectionSlice"

let socket$: WebSocketSubject<PayloadAction> | null = null

const connect = (store: Store) =>
  action$.pipe(
    filter((action) => action.type === connectPending.type),
    mergeMap(() => {
      if (socket$) {
        return EMPTY
      }
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
          next: () => {
            console.log("Socket Connection closed")
            const state = store.getState()
            const connections = state[VALKEY.CONNECTION.name]?.connections || {}

            toast.error("WebSocket connection lost! Try reconnecting.", { duration: 5000 })

            Object.keys(connections).forEach((connectionId) => {
              console.log(`Checking connection ${connectionId}, status: ${connections[connectionId].status}`)
              if (connections[connectionId].status === CONNECTED) {
                console.log(`Dispatching connectionBroken for ${connectionId}`)
                store.dispatch(connectionBroken({ connectionId }))
              }
            })
            socket$ = null
          },
        },
      })
      return socket$.pipe(
        ignoreElements(),
        catchError((err) => {
          console.error("WebSocket connection error:", err)
          return of(connectRejected(err))
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
          toast.error("WebSocket connection Lost!", { duration: 5000 })

          Object.keys(connections).forEach((connectionId) => {
            if (connections[connectionId].status === CONNECTED) {
              store.dispatch(connectionBroken({ connectionId }))
            }
          })
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
