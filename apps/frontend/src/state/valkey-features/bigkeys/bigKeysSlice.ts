import { createSlice } from "@reduxjs/toolkit"
import { type JSONObject } from "@common/src/json-utils"
import { ERROR, FULFILLED, PENDING, VALKEY } from "@common/src/constants.ts"
import * as R from "ramda"
import type { RootState } from "@/store.ts"

type BigKeysStatus = typeof PENDING | typeof FULFILLED | typeof ERROR

export interface BigKey {
  key: string
  sizeBytes: number
  type: string
  ttl: number
  nodeId?: string
}

export const selectBigKeys = (id: string) => (state: RootState) =>
  R.pathOr<BigKey[]>([], [VALKEY.BIGKEYS.name, id, "keys"], state)

export const selectBigKeysStatus = (id: string) => (state: RootState) =>
  R.path([VALKEY.BIGKEYS.name, id, "status"], state)

export const selectBigKeysError = (id: string) => (state: RootState) =>
  R.path([VALKEY.BIGKEYS.name, id, "error"], state)

export const selectBigKeysNodeErrors = (id: string) => (state: RootState) =>
  R.pathOr([], [VALKEY.BIGKEYS.name, id, "nodeErrors"], state)

export const selectBigKeysScanned = (id: string) => (state: RootState) =>
  R.path([VALKEY.BIGKEYS.name, id, "scanned"], state) ?? null

export const selectBigKeysTotalKeys = (id: string) => (state: RootState) =>
  R.path([VALKEY.BIGKEYS.name, id, "totalKeys"], state) ?? null

interface BigKeysState {
  [connectionId: string]: {
    keys: BigKey[]
    scanned: number | null
    totalKeys: number | null
    nodeId: string | null
    error?: JSONObject | null
    nodeErrors?: { connectionId: string; error: string }[]
    status: BigKeysStatus
  }
}

const initialBigKeysState: BigKeysState = {}

const emptyEntry = (status: BigKeysStatus): BigKeysState[string] => ({
  keys: [],
  scanned: null,
  totalKeys: null,
  nodeId: null,
  status,
})

const bigKeysSlice = createSlice({
  name: "bigKeys",
  initialState: initialBigKeysState,
  reducers: {
    bigKeysRequested: (state, action) => {
      const { connectionId, clusterId } = action.payload
      const id = clusterId ?? connectionId
      if (!state[id]) {
        state[id] = emptyEntry(PENDING)
      } else {
        state[id].status = PENDING
        state[id].keys = []
        state[id].error = null
      }
    },
    bigKeysFulfilled: (state, action) => {
      const { keys, scanned, totalKeys, nodeId } = action.payload.parsedResponse
      const connectionId = action.payload.connectionId
      const nodeErrors = action.payload.nodeErrors ?? []
      state[connectionId] = {
        keys,
        scanned,
        totalKeys,
        nodeId,
        nodeErrors,
        status: FULFILLED,
      }
    },
    bigKeysError: (state, action) => {
      const { connectionId, error } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = emptyEntry(ERROR)
      }
      state[connectionId].error = error
      state[connectionId].status = ERROR
    },
  },
})

export default bigKeysSlice.reducer
export const {
  bigKeysRequested,
  bigKeysFulfilled,
  bigKeysError,
} = bigKeysSlice.actions
