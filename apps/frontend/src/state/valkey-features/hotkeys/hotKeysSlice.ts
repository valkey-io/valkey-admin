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

interface HotKeysState {
  [connectionId: string]: {
    hotKeys: [string, number, number | null, number, string?][]
    checkAt: string | null,
    monitorRunning: boolean,
    nodeId: string | null,
    error?: JSONObject | null,
    nodeErrors?: { connectionId: string; error: string }[],
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
      const { hotKeys, monitorRunning, checkAt, nodeId } = action.payload.parsedResponse
      const connectionId = action.payload.connectionId
      const nodeErrors = action.payload.nodeErrors ?? []
      if (!state[connectionId]) {
        state[connectionId] = {
          hotKeys: [],
          checkAt: null,
          monitorRunning: false,
          nodeId: null,
          status: PENDING,
        }
      }
      state[connectionId] = {
        hotKeys,
        checkAt,
        monitorRunning,
        nodeId,
        nodeErrors,
        status: FULFILLED,
      }
      
    },
    hotKeysError: (state, action) => {
      const { connectionId, error } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = {
          hotKeys: [],
          checkAt: null, 
          monitorRunning: false,
          nodeId: null,
          status: ERROR,
        }
      }
      state[connectionId].error = error
      state[connectionId].status = ERROR
    },
  },
})
export default hotKeysSlice.reducer
export const {
  hotKeysRequested,
  hotKeysFulfilled,
  hotKeysError,
} = hotKeysSlice.actions
