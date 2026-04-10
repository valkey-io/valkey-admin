import * as R from "ramda"
import { VALKEY, CONNECTED, CONNECTING } from "@common/src/constants.ts"
import { MAX_CONNECTIONS } from "@common/src/constants.ts"
import type { RootState } from "@/store.ts"

export const atId = R.curry((id: string, state: RootState) => R.path([VALKEY.CONNECTION.name, "connections", id], state))

export const selectStatus = (id: string) => (state: RootState) => atId(id, state)?.status
export const selectConnectionDetails = (id: string) => (state: RootState) => atId(id, state)?.connectionDetails
export const selectConnections = (state: RootState) => state[VALKEY.CONNECTION.name].connections
export const selectConnectionCount = (state: RootState) =>
  Object.values(selectConnections(state)).filter(
    (connection) => connection.status === CONNECTED,
  ).length

export const selectIsAtConnectionLimit = (state: RootState) => selectConnectionCount(state) >= MAX_CONNECTIONS
export const selectIsAnyConnecting = (state: RootState) =>
  Object.values(selectConnections(state)).some((c) => c.status === CONNECTING)
export const selectJsonModuleAvailable = (id: string) => (state: RootState) =>
  atId(id, state)?.connectionDetails?.jsonModuleAvailable ?? false
export const selectEndpointType = (id: string) => (state: RootState) => atId(id, state)?.connectionDetails.endpointType ?? "node"

export const selectEncryptedPassword = (clusterId: string) => (state: RootState) =>
  Object.values(state.valkeyConnection?.connections ?? {}).find(
    (c) => c.connectionDetails?.clusterId === clusterId && c.connectionDetails?.password,
  )?.connectionDetails?.password

export const selectConfigEndpointNode = (clusterId: string) => (state: RootState) => {
  const entry = Object.entries(state.valkeyConnection.connections).find(([, c]) =>
    c.connectionDetails?.clusterId === clusterId && c.connectedNode)
  if (!entry) return undefined
  const [connectionId, conn] = entry
  return { ...conn.connectedNode, status: conn.status, connectionId }
}

