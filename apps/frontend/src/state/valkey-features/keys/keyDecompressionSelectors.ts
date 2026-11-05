import * as R from "ramda"
import { VALKEY } from "@common/src/constants.ts"
import type { DecompressionEntry } from "./keyDecompressionSlice"
import type { RootState } from "@/store.ts"

export const selectKeyDecompression = (connectionId: string, key: string) => (state: RootState) =>
  R.path<DecompressionEntry>([VALKEY.KEY_DECOMPRESSION.name, connectionId, key], state)
