import { tap, ignoreElements } from "rxjs/operators"
import { merge } from "rxjs"
import { toast } from "sonner"
import { getSocket } from "./wsEpics"
import {
  getKeysRequested,
  getKeyTypeRequested,
  deleteKeyRequested,
  addKeyRequested,
  addKeyFailed,
  updateKeyRequested
} from "../valkey-features/keys/keyBrowserSlice"
import { action$, select } from "../middleware/rxjsMiddleware/rxjsMiddleware"

export const keyBrowserEpic = () =>
  merge(
    // for getting all keys (getKeys)
    action$.pipe(
      select(getKeysRequested),
      tap((action) => {
        const socket = getSocket()
        console.debug("Sending getKeys request to server...")
        socket.next(action)
      }),
    ),

    // for getting a key type and ttl (getKeyInfo)
    action$.pipe(
      select(getKeyTypeRequested),
      tap((action) => {
        const socket = getSocket()
        console.debug("Sending getKeyType request to server...")
        socket.next(action)
      }),
    ),

    // for deleting a key (deleteKey)
    action$.pipe(
      select(deleteKeyRequested),
      tap((action) => {
        const socket = getSocket()
        console.debug("Sending deleteKey request to server...")
        socket.next(action)
      }),
    ),

    // add new key (addKey)
    action$.pipe(
      select(addKeyRequested),
      tap((action) => {
        const socket = getSocket()
        console.debug("Sending addKey request to server...")
        socket.next(action)
      }),
    ),

    // handle addKey failure (addKeyFailed)
    action$.pipe(
      select(addKeyFailed),
      tap(({ payload }) => toast.error(`Failed to add key: ${payload.error}`)),
      ignoreElements(),
    ),

    // update existing key (updateKey)
    action$.pipe(
      select(updateKeyRequested),
      tap((action) => {
        const socket = getSocket()
        console.debug("Sending updateKey request to server...")
        socket.next(action)
      }),
    ),
  )
