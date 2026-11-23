import { createSlice, type PayloadAction } from "@reduxjs/toolkit"
import { ERROR, FULFILLED, PENDING, VALKEY } from "@common/src/constants.ts"
import { toNodeId } from "@common/src/connection-id.ts"
import * as R from "ramda"
import type {
  HotKeyEntry,
  HotKeysErrorPayload,
  HotKeysFulfilledPayload,
  HotKeysRequestPayload
} from "@common/src/hotkeys.ts"
import type { NodeError } from "@common/src/node-results.ts"
import type { RootState } from "@/store.ts"

type HotKeysStatus = typeof PENDING | typeof FULFILLED | typeof ERROR

// `targetId` is the state key: `clusterId` for a cluster aggregate or the
// db-less `nodeId` for a standalone node.
export const selectHotKeys = (targetId: string) => (state: RootState) =>
  R.path([VALKEY.HOTKEYS.name, targetId, "hotKeys"], state)

export const selectHotKeysStatus = (targetId: string) => (state: RootState) =>
  R.path([VALKEY.HOTKEYS.name, targetId, "status"], state)

export const selectHotKeysError = (targetId: string) => (state: RootState) =>
  R.path([VALKEY.HOTKEYS.name, targetId, "error"], state)

export const selectHotKeysNodeErrors = (targetId: string) => (state: RootState) =>
  R.path([VALKEY.HOTKEYS.name, targetId, "nodeErrors"], state) ?? []

export const selectHotKeysLastCollectedAt = (targetId: string) => (state: RootState) =>
  R.path([VALKEY.HOTKEYS.name, targetId, "lastCollectedAt"], state) ?? null

interface HotKeysState {
  // Keyed by `targetId`: `clusterId` (cluster) or db-less `nodeId` (standalone).
  [targetId: string]: {
    hotKeys: HotKeyEntry[]
    checkAt?: number | null,
    monitorRunning?: boolean,
    nodeId?: string | null,
    lastCollectedAt?: number | null,
    error?: string | null,
    nodeErrors?: NodeError[],
    status: HotKeysStatus,
  }
}

const initialHotKeysState: HotKeysState = {}

const hotKeysSlice = createSlice({
  name: "hotKeys",
  initialState: initialHotKeysState,
  reducers: {
    hotKeysRequested: (state, action: PayloadAction<Pick<HotKeysRequestPayload, "connectionId" | "clusterId" | "count">>) => {
      const { connectionId, clusterId } = action.payload
      // Standalone hot keys state is node-level.
      const targetId = clusterId ?? toNodeId(connectionId)
      if (!state[targetId]) {
        state[targetId] = {
          hotKeys: [],
          checkAt: null,
          monitorRunning: false,
          nodeId: null,
          status: PENDING,
        }
      } else {
        state[targetId].status = PENDING
        state[targetId].hotKeys = []
        state[targetId].error = null
      }
    },
    hotKeysFulfilled: (state, action: PayloadAction<HotKeysFulfilledPayload>) => {
      const { hotKeys, monitorRunning, checkAt, nodeId, lastCollectedAt } = action.payload.parsedResponse
      const targetId = "clusterId" in action.payload ? action.payload.clusterId : action.payload.nodeId
      const nodeErrors = action.payload.nodeErrors ?? []
      state[targetId] = {
        hotKeys,
        checkAt,
        monitorRunning,
        nodeId,
        lastCollectedAt,
        nodeErrors,
        status: FULFILLED,
      }
    },
    hotKeysError: (state, action: PayloadAction<HotKeysErrorPayload>) => {
      const { error } = action.payload
      const targetId = action.payload.clusterId ?? action.payload.nodeId
      if (!state[targetId]) {
        state[targetId] = {
          hotKeys: [],
          checkAt: null,
          monitorRunning: false,
          nodeId: null,
          status: ERROR,
        }
      }
      state[targetId].error = error
      state[targetId].status = ERROR
    },
  },
})
export default hotKeysSlice.reducer
export const {
  hotKeysRequested,
  hotKeysFulfilled,
  hotKeysError,
} = hotKeysSlice.actions
