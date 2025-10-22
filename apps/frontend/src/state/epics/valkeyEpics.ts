import { merge } from "rxjs"
import { ignoreElements, tap } from "rxjs/operators"
import * as R from "ramda"
import { LOCAL_STORAGE, NOT_CONNECTED } from "@common/src/constants.ts"
import { toast } from "sonner"
import { getSocket } from "./wsEpics"
import { connectFulfilled, connectPending, deleteConnection } from "../valkey-features/connection/connectionSlice"
import { sendRequested } from "../valkey-features/command/commandSlice"
import { setData } from "../valkey-features/info/infoSlice"
import { action$, select } from "../middleware/rxjsMiddleware/rxjsMiddlware"
import { setClusterData } from "../valkey-features/cluster/clusterSlice"
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
      if (clusterId) socket.next({ type: setClusterData.type, payload: { clusterId, connectionId } })
      else socket.next({ type: setData.type, payload: { connectionId } })
    }),
  )
