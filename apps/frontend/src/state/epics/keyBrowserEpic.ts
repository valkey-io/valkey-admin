import { tap } from "rxjs/operators"
import { merge } from "rxjs"
import { getSocket } from "./wsEpics"
import {
  getKeysRequested,
  getKeyTypeRequested,
  deleteKeyRequested,
  addKeyRequested,
  updateKeyRequested
} from "../valkey-features/keys/keyBrowserSlice"
import { action$, select } from "../middleware/rxjsMiddleware/rxjsMiddlware"

export const keyBrowserEpic = () =>
  merge(
    // for getting all keys (getKeys)
    action$.pipe(
      select(getKeysRequested),
      tap((action) => {
        const socket = getSocket()
        console.log("Sending getKeys request to server...")
        socket.next(action)
      }),
    ),

    // for getting a key type and ttl (getKeyInfo)
    action$.pipe(
      select(getKeyTypeRequested),
      tap((action) => {
        const socket = getSocket()
        console.log("Sending getKeyType request to server...")
        socket.next(action)
      }),
    ),

    // for deleting a key (deleteKey)
    action$.pipe(
      select(deleteKeyRequested),
      tap((action) => {
        const socket = getSocket()
        console.log("Sending deleteKey request to server...")
        socket.next(action)
      }),
    ),

    // add new key (addKey)
    action$.pipe(
      select(addKeyRequested),
      tap((action) => {
        const socket = getSocket()
        console.log("Sending addKey request to server...")
        socket.next(action)
      }),
    ),

    // update existing key (updateKey)
    action$.pipe(
      select(updateKeyRequested),
      tap((action) => {
        const socket = getSocket()
        console.log("Sending updateKey request to server...")
        socket.next(action)
      }),
    ),
  )
