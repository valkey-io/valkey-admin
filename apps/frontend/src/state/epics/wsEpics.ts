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
import { action$ } from "../middleware/rxjsMiddleware/rxjsMiddlware"
import type { PayloadAction, Store } from "@reduxjs/toolkit"
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
