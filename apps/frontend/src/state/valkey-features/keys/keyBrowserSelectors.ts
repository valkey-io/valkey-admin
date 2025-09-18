import type { RootState } from "@/store.ts";
import * as R from "ramda";
import { VALKEY } from "@common/src/constants.ts";
import { defaultConnectionState } from "./keyBrowserSlice";

export const selectKeys = (id: string) => (state: RootState) =>
  R.pathOr(defaultConnectionState.keys, [VALKEY.KEYS.name, id, "keys"], state)

export const selectCursor = (id: string) => (state: RootState) =>
  R.pathOr(defaultConnectionState.cursor, [VALKEY.KEYS.name, id, "cursor"], state)

export const selectLoading = (id: string) => (state: RootState) =>
  R.pathOr(defaultConnectionState.loading, [VALKEY.KEYS.name, id, "loading"], state)

export const selectError = (id: string) => (state: RootState) =>
  R.pathOr(defaultConnectionState.error, [VALKEY.KEYS.name, id, "error"], state)

export const selectKeyBrowserState = (id: string) => (state: RootState) =>
  R.pathOr(defaultConnectionState, [VALKEY.KEYS.name, id], state)
