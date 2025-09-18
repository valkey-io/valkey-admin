import type { RootState } from "@/store.ts"
import * as R from "ramda"
import {VALKEY} from "@common/src/constants.ts"

export const selectKeys = (id: string) => (state: RootState) =>
  R.path([VALKEY.KEYS.name, id, "keys"], state) || []

export const selectCursor = (id: string) => (state: RootState) =>
  R.path([VALKEY.KEYS.name, id, "cursor"], state) || "0"

export const selectLoading = (id: string) => (state: RootState) =>
  R.path([VALKEY.KEYS.name, id, "loading"], state) || false

export const selectError = (id: string) => (state: RootState) =>
  R.path([VALKEY.KEYS.name, id, "error"], state) || null

export const selectKeyBrowserState = (id: string) => (state: RootState) =>
  R.path([VALKEY.KEYS.name, id], state) || {
    keys: [],
    cursor: "0",
    loading: false,
    error: null
  }