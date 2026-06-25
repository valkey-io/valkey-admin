import { createSlice } from "@reduxjs/toolkit"
import { type JSONObject } from "@common/src/json-utils"
import { ERROR, FULFILLED, PENDING, VALKEY } from "@common/src/constants.ts"
import { toNodeId } from "@common/src/connection-id.ts"
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

export const selectBigKeys = (targetId: string) => (state: RootState) =>
  R.pathOr<BigKey[]>([], [VALKEY.BIGKEYS.name, targetId, "keys"], state)

export const selectBigKeysStatus = (targetId: string) => (state: RootState) =>
  R.path([VALKEY.BIGKEYS.name, targetId, "status"], state)

export const selectBigKeysError = (targetId: string) => (state: RootState) =>
  R.path([VALKEY.BIGKEYS.name, targetId, "error"], state)

export const selectBigKeysNodeErrors = (targetId: string) => (state: RootState) =>
  R.pathOr([], [VALKEY.BIGKEYS.name, targetId, "nodeErrors"], state)

export const selectBigKeysScanned = (targetId: string) => (state: RootState) =>
  R.path([VALKEY.BIGKEYS.name, targetId, "scanned"], state) ?? null

export const selectBigKeysTotalKeys = (targetId: string) => (state: RootState) =>
  R.path([VALKEY.BIGKEYS.name, targetId, "totalKeys"], state) ?? null

interface BigKeysState {
  // Keyed by `targetId`: `clusterId` (cluster) or db-less `nodeId` (standalone).
  [targetId: string]: {
    keys: BigKey[]
    scanned: number | null
    totalKeys: number | null
    nodeId: string | null
    error?: JSONObject | null
    nodeErrors?: { nodeId: string; error: string }[]
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
      const targetId = clusterId ?? toNodeId(connectionId)
      if (!state[targetId]) {
        state[targetId] = emptyEntry(PENDING)
      } else {
        state[targetId].status = PENDING
        state[targetId].keys = []
        state[targetId].error = null
      }
    },
    bigKeysFulfilled: (state, action) => {
      const { keys, scanned, totalKeys, nodeId } = action.payload.parsedResponse
      const targetId = action.payload.clusterId ?? action.payload.nodeId
      const nodeErrors = action.payload.nodeErrors ?? []
      state[targetId] = {
        keys,
        scanned,
        totalKeys,
        nodeId,
        nodeErrors,
        status: FULFILLED,
      }
    },
    bigKeysError: (state, action) => {
      const { error } = action.payload
      const targetId = action.payload.clusterId ?? action.payload.nodeId
      if (!state[targetId]) {
        state[targetId] = emptyEntry(ERROR)
      }
      state[targetId].error = error
      state[targetId].status = ERROR
    },
  },
})

export default bigKeysSlice.reducer
export const {
  bigKeysRequested,
  bigKeysFulfilled,
  bigKeysError,
} = bigKeysSlice.actions
