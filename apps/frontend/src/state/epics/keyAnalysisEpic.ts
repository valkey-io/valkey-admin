import { tap } from "rxjs/operators"
import { getSocket } from "./wsEpics"
import { analysisRequested } from "../valkey-features/key-analysis/keyAnalysisSlice"
import { action$, select } from "../middleware/rxjsMiddleware/rxjsMiddleware"

export const keyAnalysisEpic = () =>
  action$.pipe(
    select(analysisRequested),
    tap((action) => {
      const socket = getSocket()
      const { connectionId, limit, sampleCount } = action.payload
      socket.next({
        type: action.type,
        payload: { connectionId, limit, sampleCount },
      })
    }),
  )
