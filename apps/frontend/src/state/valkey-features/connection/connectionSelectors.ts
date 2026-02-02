import * as R from "ramda"
import { VALKEY } from "@common/src/constants.ts"
import type { RootState } from "@/store.ts"

export const atId = R.curry((id: string, state: RootState) => R.path([VALKEY.CONNECTION.name, "connections", id], state))

export const selectStatus = (id: string) => (state: RootState) => atId(id, state)?.status
export const selectConnectionDetails = (id: string) => (state: RootState) => atId(id, state)?.connectionDetails
export const selectConnections = (state: RootState) => state[VALKEY.CONNECTION.name].connections
export const selectJsonModuleAvailable = (id: string) => (state: RootState) =>
  atId(id, state)?.connectionDetails?.jsonModuleAvailable ?? false
