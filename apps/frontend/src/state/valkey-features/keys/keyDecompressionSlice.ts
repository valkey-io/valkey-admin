import { createSlice, nanoid, type PayloadAction } from "@reduxjs/toolkit"
import { VALKEY } from "@common/src/constants.ts"
import { deleteKeyFulfilled, getKeyTypeFulfilled } from "./keyBrowserSlice"
import type { CompressionCodec } from "@common/src/compression"
import type { DecompressedView } from "@/lib/decompression/render"

export type CodecChoice = CompressionCodec | "auto"

export interface DecompressionResult {
  codec: CompressionCodec;
  view: DecompressedView;
  preview: string;
  previewTruncated: boolean;
  previewStart: number;
  previewBytes: number;
  outputBytes: number;
  inputBytes: number;
  // Decoding stopped at `outputLimit`; more output may follow.
  truncated: boolean;
  declaredSize?: number;
  outputLimit: number;
  // Server-configured step for continuing past the limit.
  maxOutputBytes: number;
}

export interface DecompressionEntry {
  status: "loading" | "decoding" | "decoded" | "failed";
  requestId: string;
  codecChoice: CodecChoice;
  // Requested output limit; undefined uses the server's default.
  outputLimit?: number;
  // Output offset the preview starts at; Continue sets it to the previous limit to show the newly decoded part.
  previewStart?: number;
  result?: DecompressionResult;
  error?: string;
}

interface KeyDecompressionState {
  [connectionId: string]: { [key: string]: DecompressionEntry };
}

type KeyTarget = { connectionId: string; key: string }
type RequestTarget = KeyTarget & { requestId: string }
type DecodeOptions = { codecChoice: CodecChoice; outputLimit?: number; previewStart?: number }

const initialState: KeyDecompressionState = {}

function currentEntry(state: KeyDecompressionState, { connectionId, key, requestId }: RequestTarget) {
  const entry = state[connectionId]?.[key]
  return entry?.requestId === requestId ? entry : undefined
}

function removeEntry(state: KeyDecompressionState, { connectionId, key }: KeyTarget) {
  if (state[connectionId]) delete state[connectionId][key]
}

const keyDecompressionSlice = createSlice({
  name: VALKEY.KEY_DECOMPRESSION.name,
  initialState,
  reducers: {
    // Also the websocket request: the server replies with the value's bytes.
    rawValueRequested: {
      reducer: (state, action: PayloadAction<RequestTarget & DecodeOptions>) => {
        const { connectionId, key, requestId, codecChoice, outputLimit, previewStart } = action.payload
        state[connectionId] ??= {}
        state[connectionId][key] = { status: "loading", requestId, codecChoice, outputLimit, previewStart }
      },
      prepare: (payload: KeyTarget & DecodeOptions) => ({
        payload: { ...payload, requestId: nanoid() },
      }),
    },
    rawValueFulfilled: (
      state,
      action: PayloadAction<RequestTarget & {
        base64: string; byteLength: number; maxOutputBytes: number; previewMaxBytes: number
      }>,
    ) => {
      // The bytes go to the decoding epic only; they are not kept in state.
      const entry = currentEntry(state, action.payload)
      if (entry) entry.status = "decoding"
    },
    rawValueFailed: (state, action: PayloadAction<RequestTarget & { error: string }>) => {
      const entry = currentEntry(state, action.payload)
      if (entry) Object.assign(entry, { status: "failed", error: action.payload.error })
    },
    decompressFulfilled: (state, action: PayloadAction<RequestTarget & { result: DecompressionResult }>) => {
      const entry = currentEntry(state, action.payload)
      if (entry) Object.assign(entry, { status: "decoded", result: action.payload.result })
    },
    decompressFailed: (state, action: PayloadAction<RequestTarget & { error: string }>) => {
      const entry = currentEntry(state, action.payload)
      if (entry) Object.assign(entry, { status: "failed", error: action.payload.error })
    },
    // Cancelling or closing the decoded view returns to the stored value.
    decompressCleared: (state, action: PayloadAction<KeyTarget>) => {
      removeEntry(state, action.payload)
    },
  },
  extraReducers: (builder) => {
    // A reloaded or deleted key drops its decoded view, which may no longer match the value.
    builder
      .addCase(getKeyTypeFulfilled, (state, action) => removeEntry(state, action.payload))
      .addCase(deleteKeyFulfilled, (state, action) => removeEntry(state, action.payload))
  },
})

export default keyDecompressionSlice.reducer
export const {
  rawValueRequested,
  rawValueFulfilled,
  rawValueFailed,
  decompressFulfilled,
  decompressFailed,
  decompressCleared,
} = keyDecompressionSlice.actions
