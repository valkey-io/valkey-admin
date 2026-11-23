import { createSlice, type PayloadAction } from "@reduxjs/toolkit"
import { ERROR, FULFILLED, PENDING, VALKEY } from "@common/src/constants.ts"
import { toNodeId } from "@common/src/connection-id.ts"
import * as R from "ramda"
import type {
  BigKey,
  BigKeysErrorPayload,
  BigKeysFulfilledPayload,
  BigKeysRequestPayload
} from "@common/src/bigkeys.ts"
import type { NodeError } from "@common/src/node-results.ts"
import type { RootState } from "@/store.ts"

type BigKeysStatus = typeof PENDING | typeof FULFILLED | typeof ERROR

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

export const selectBigKeysLastScannedAt = (targetId: string) => (state: RootState) =>
  R.path([VALKEY.BIGKEYS.name, targetId, "lastScannedAt"], state) ?? null

interface BigKeysState {
  // Keyed by `targetId`: `clusterId` (cluster) or db-less `nodeId` (standalone).
  [targetId: string]: {
    keys: BigKey[]
    scanned: number | null
    totalKeys: number | null
    nodeId: string | null
    lastScannedAt: number | null
    error?: string | null
    nodeErrors?: NodeError[]
    status: BigKeysStatus
  }
}

const initialBigKeysState: BigKeysState = {}

const emptyEntry = (status: BigKeysStatus): BigKeysState[string] => ({
  keys: [],
  scanned: null,
  totalKeys: null,
  nodeId: null,
  lastScannedAt: null,
  status,
})

const bigKeysSlice = createSlice({
  name: "bigKeys",
  initialState: initialBigKeysState,
  reducers: {
    bigKeysRequested: (state, action: PayloadAction<BigKeysRequestPayload>) => {
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
    bigKeysFulfilled: (state, action: PayloadAction<BigKeysFulfilledPayload>) => {
      const { keys, scanned, totalKeys, nodeId, scannedAt } = action.payload.parsedResponse
      const targetId = "clusterId" in action.payload ? action.payload.clusterId : action.payload.nodeId
      const nodeErrors = action.payload.nodeErrors ?? []
      state[targetId] = {
        keys,
        scanned,
        totalKeys,
        nodeId,
        nodeErrors,
        lastScannedAt: scannedAt ?? null,
        status: FULFILLED,
      }
    },
    bigKeysError: (state, action: PayloadAction<BigKeysErrorPayload>) => {
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
