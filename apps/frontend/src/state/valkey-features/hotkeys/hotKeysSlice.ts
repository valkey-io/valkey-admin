import { createSlice } from "@reduxjs/toolkit"
import { type JSONObject } from "@common/src/json-utils"
import { ERROR, FULFILLED, PENDING, VALKEY } from "@common/src/constants.ts"
import * as R from "ramda"
import type { RootState } from "@/store.ts"

type HotKeysStatus = typeof PENDING | typeof FULFILLED | typeof ERROR

export const selectHotKeys = (id: string) => (state: RootState) =>
  R.path([VALKEY.HOTKEYS.name, id, "hotKeys"], state)

export const selectHotKeysStatus = (id: string) => (state: RootState) =>
  R.path([VALKEY.HOTKEYS.name, id, "status"], state)

export const selectHotKeysError = (id: string) => (state: RootState) =>
  R.path([VALKEY.HOTKEYS.name, id, "error"], state)

export const selectHotKeysNodeErrors = (id: string) => (state: RootState) =>
  R.path([VALKEY.HOTKEYS.name, id, "nodeErrors"], state) ?? []

export const selectHotKeysLastCollectedAt = (id: string) => (state: RootState) =>
  R.path([VALKEY.HOTKEYS.name, id, "lastCollectedAt"], state) ?? null

interface HotKeysState {
  [connectionId: string]: {
    hotKeys: [string, number, number | null, number, string?][]
    checkAt: string | null,
    monitorRunning: boolean,
    nodeId: string | null,
    lastCollectedAt?: number | null,
    error?: JSONObject | null,
    nodeErrors?: { nodeId: string; error: string }[],
    status: HotKeysStatus,
  }
}

const initialHotKeysState: HotKeysState = {}

const hotKeysSlice = createSlice({
  name: "hotKeys",
  initialState: initialHotKeysState,
  reducers: {
    hotKeysRequested: (state, action) => {
      const { connectionId, clusterId } = action.payload
      const id = clusterId ?? connectionId
      if (!state[id]) {
        state[id] = {
          hotKeys: [],
          checkAt: null,
          monitorRunning: false,
          nodeId: null,
          status: PENDING,
        }
      } else {
        state[id].status = PENDING
        state[id].hotKeys = []
        state[id].error = null
      }
    },
    hotKeysFulfilled: (state, action) => {
      const { hotKeys, monitorRunning, checkAt, nodeId, lastCollectedAt } = action.payload.parsedResponse
      const key = action.payload.clusterId ?? action.payload.connectionId
      const nodeErrors = action.payload.nodeErrors ?? []
      if (!state[key]) {
        state[key] = {
          hotKeys: [],
          checkAt: null,
          monitorRunning: false,
          nodeId: null,
          status: PENDING,
        }
      }
      state[key] = {
        hotKeys,
        checkAt,
        monitorRunning,
        nodeId,
        lastCollectedAt,
        nodeErrors,
        status: FULFILLED,
      }
      
    },
    hotKeysError: (state, action) => {
      const { error } = action.payload
      const key = action.payload.clusterId ?? action.payload.connectionId
      if (!state[key]) {
        state[key] = {
          hotKeys: [],
          checkAt: null, 
          monitorRunning: false,
          nodeId: null,
          status: ERROR,
        }
      }
      state[key].error = error
      state[key].status = ERROR
    },
  },
})
export default hotKeysSlice.reducer
export const {
  hotKeysRequested,
  hotKeysFulfilled,
  hotKeysError,
} = hotKeysSlice.actions
