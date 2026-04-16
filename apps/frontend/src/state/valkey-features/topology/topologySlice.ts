import { createSlice, type PayloadAction } from "@reduxjs/toolkit"
import { VALKEY } from "@common/src/constants"
import type { ConnectionDetails } from "@/state/valkey-features/connection/connectionSlice"

export interface DiscoveredNode {
  host: string
  port: number
}

export type DiscoveryStatus = "pending" | "fulfilled" | "rejected"

export interface DiscoveryState {
  status: DiscoveryStatus
  connectionDetails: ConnectionDetails
  clusterNodes?: Record<string, DiscoveredNode>
  errorMessage?: string
}

export interface TopologyState {
  discoveries: Record<string, DiscoveryState>
}

const initialState: TopologyState = {
  discoveries: {},
}

const topologySlice = createSlice({
  name: VALKEY.TOPOLOGY.name,
  initialState,
  reducers: {
    discoveryEndpointPending: (
      state,
      action: PayloadAction<{ discoveryId: string; connectionDetails: ConnectionDetails }>,
    ) => {
      const { discoveryId, connectionDetails } = action.payload
      state.discoveries[discoveryId] = {
        status: "pending",
        connectionDetails,
      }
    },
    discoveryEndpointFulfilled: (
      state,
      action: PayloadAction<{ discoveryId: string; clusterNodes: Record<string, DiscoveredNode> }>,
    ) => {
      const { discoveryId, clusterNodes } = action.payload
      const entry = state.discoveries[discoveryId]
      if (!entry) return
      entry.status = "fulfilled"
      entry.clusterNodes = clusterNodes
      entry.errorMessage = undefined
    },
    discoveryEndpointRejected: (
      state,
      action: PayloadAction<{ discoveryId: string; errorMessage: string }>,
    ) => {
      const { discoveryId, errorMessage } = action.payload
      const entry = state.discoveries[discoveryId]
      if (!entry) return
      entry.status = "rejected"
      entry.errorMessage = errorMessage
    },
    clearEndpointDiscovery: (state, action: PayloadAction<{ discoveryId: string }>) => {
      delete state.discoveries[action.payload.discoveryId]
    },
  },
})

export const {
  discoveryEndpointPending,
  discoveryEndpointFulfilled,
  discoveryEndpointRejected,
  clearEndpointDiscovery,
} = topologySlice.actions

export default topologySlice.reducer
