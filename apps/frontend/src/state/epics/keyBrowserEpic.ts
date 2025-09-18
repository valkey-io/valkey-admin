import { tap } from "rxjs/operators"
import { getSocket } from "./wsEpics"
import { getKeysRequested } from "../valkey-features/keys/keyBrowserSlice" 
import { action$, select } from "../middleware/rxjsMiddleware/rxjsMiddlware"

export const keyBrowserEpic = () =>
  action$.pipe(
    select(getKeysRequested),
    tap((action) => {
      const socket = getSocket()
      console.log("Sending getKeys request to server...")
      socket.next(action)
    }),
  )