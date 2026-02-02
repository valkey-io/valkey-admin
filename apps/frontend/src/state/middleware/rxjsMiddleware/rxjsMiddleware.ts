/* eslint-disable @typescript-eslint/no-explicit-any */
import { type OperatorFunction, Subject } from "rxjs"
import { type Action, type Middleware, type PayloadAction } from "@reduxjs/toolkit"
import { filter } from "rxjs/operators"

export const action$ = new Subject<PayloadAction>()

export const rxjsMiddleware: Middleware = () => (next) => (action: unknown) => {
  const result = next(action)
  action$.next(action as PayloadAction)
  return result
}

// An RTK action creator from createAction/createSlice has a `.match` guard — since we can't export
// Match from @reduxjs/toolkit because it's not exported
// todo satisfy the damn ts compiler
type RTKCreator<A extends { type: string }> =
  ((...args: any[]) => A) & { type: string; match(action: Action): action is A }

export function select<AC extends RTKCreator<any>>(
  creator: AC,
): OperatorFunction<Action, ReturnType<AC>> {
  return filter(creator.match)
}

export function selectMany<
  ACs extends ReadonlyArray<RTKCreator<any>>
>(...creators: ACs): OperatorFunction<Action, ReturnType<ACs[number]>> {
  return filter(
    (a: Action): a is ReturnType<ACs[number]> =>
      creators.some((c) => c.match(a)),
  )
}
