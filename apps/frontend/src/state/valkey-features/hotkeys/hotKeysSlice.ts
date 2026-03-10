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

interface HotKeysState {
  [connectionId: string]: {
    hotKeys: [string, number, number | null, number][]
    checkAt: string | null,
    monitorRunning: boolean,
    nodeId: string | null,
    error?: JSONObject | null,
    status: HotKeysStatus,
  }
}

const initialHotKeysState: HotKeysState = {}

const hotKeysSlice = createSlice({
  name: "hotKeys",
  initialState: initialHotKeysState,
  reducers: {
    hotKeysRequested: (state, action) => {
      const connectionId = action.payload.connectionId
      if (!state[connectionId]) {
        state[connectionId] = {
          hotKeys: [],
          checkAt: null,
          monitorRunning: false,
          nodeId: null,
          status: PENDING,
        }
      } else {
        state[connectionId].status = PENDING
      }
    },
    hotKeysFulfilled: (state, action) => {
      const { hotKeys, monitorRunning, checkAt, nodeId } = action.payload.parsedResponse
      const connectionId = action.payload.connectionId
      state[connectionId] = {
        hotKeys,
        checkAt,
        monitorRunning, 
        nodeId,
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
