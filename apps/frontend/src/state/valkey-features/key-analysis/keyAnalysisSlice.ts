import { createSlice } from "@reduxjs/toolkit"
import { ERROR, FULFILLED, PENDING, VALKEY } from "@common/src/constants.ts"
import * as R from "ramda"
import type { RootState } from "@/store.ts"

export interface AnalyzedKeyInfo {
  name: string
  type: string
  memoryUsage: number
  collectionSize: number | null
  ttl: number
}

type AnalysisStatus = "Idle" | typeof PENDING | typeof FULFILLED | typeof ERROR

interface AnalysisProgress {
  scannedCount: number
  totalEstimated: number
  phase: "idle" | "scanning" | "enriching"
}

interface AnalysisState {
  [connectionId: string]: {
    status: AnalysisStatus
    keys: AnalyzedKeyInfo[]
    totalKeys: number
    scannedKeys: number
    totalMemoryScanned: number
    progress: AnalysisProgress
    error: string | null
  }
}

const initialState: AnalysisState = {}

const keyAnalysisSlice = createSlice({
  name: VALKEY.KEY_ANALYSIS.name,
  initialState,
  reducers: {
    analysisRequested: (state, action) => {
      const { connectionId } = action.payload
      const id = connectionId
      state[id] = {
        status: PENDING,
        keys: [],
        totalKeys: 0,
        scannedKeys: 0,
        totalMemoryScanned: 0,
        progress: { scannedCount: 0, totalEstimated: 0, phase: "idle" },
        error: null,
      }
    },
    analysisProgress: (state, action) => {
      const { connectionId, scannedCount, totalEstimated, phase } = action.payload
      if (state[connectionId]) {
        state[connectionId].progress = { scannedCount, totalEstimated, phase }
      }
    },
    analysisFulfilled: (state, action) => {
      const { connectionId, keys, totalKeys, scannedKeys, totalMemoryScanned } = action.payload
      state[connectionId] = {
        status: FULFILLED,
        keys,
        totalKeys,
        scannedKeys,
        totalMemoryScanned,
        progress: { scannedCount: scannedKeys, totalEstimated: totalKeys, phase: "idle" },
        error: null,
      }
    },
    analysisError: (state, action) => {
      const { connectionId, error } = action.payload
      if (state[connectionId]) {
        state[connectionId].status = ERROR
        state[connectionId].error = error
      }
    },
  },
})

export default keyAnalysisSlice.reducer

export const {
  analysisRequested,
  analysisProgress,
  analysisFulfilled,
  analysisError,
} = keyAnalysisSlice.actions

export const selectAnalysisStatus = (id: string) => (state: RootState) =>
  R.path([VALKEY.KEY_ANALYSIS.name, id, "status"], state) ?? "Idle"

export const selectAnalysisKeys = (id: string) => (state: RootState) =>
  R.path<AnalyzedKeyInfo[]>([VALKEY.KEY_ANALYSIS.name, id, "keys"], state) ?? []

export const selectAnalysisTotalKeys = (id: string) => (state: RootState) =>
  R.path<number>([VALKEY.KEY_ANALYSIS.name, id, "totalKeys"], state) ?? 0

export const selectAnalysisScannedKeys = (id: string) => (state: RootState) =>
  R.path<number>([VALKEY.KEY_ANALYSIS.name, id, "scannedKeys"], state) ?? 0

export const selectAnalysisTotalMemory = (id: string) => (state: RootState) =>
  R.path<number>([VALKEY.KEY_ANALYSIS.name, id, "totalMemoryScanned"], state) ?? 0

export const selectAnalysisProgress = (id: string) => (state: RootState) =>
  R.path<AnalysisProgress>([VALKEY.KEY_ANALYSIS.name, id, "progress"], state) ?? { scannedCount: 0, totalEstimated: 0, phase: "idle" as const }

export const selectAnalysisError = (id: string) => (state: RootState) =>
  R.path<string>([VALKEY.KEY_ANALYSIS.name, id, "error"], state) ?? null
