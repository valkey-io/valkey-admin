import * as R from "ramda"
import { VALKEY } from "@common/src/constants.ts"
import { defaultConnectionState } from "./keyBrowserSlice"
import type { RootState } from "@/store.ts"

export const selectKeys = (id: string) => (state: RootState) =>
  R.pathOr(defaultConnectionState.keys, [VALKEY.KEYS.name, id, "keys"], state)

export const selectTotalKeys = (id: string) => (state: RootState) =>
  R.pathOr(defaultConnectionState.keys, [VALKEY.KEYS.name, id, "totalKeys"], state)

export const selectCursor = (id: string) => (state: RootState) =>
  R.pathOr(defaultConnectionState.cursor, [VALKEY.KEYS.name, id, "cursor"], state)

export const selectLoading = (id: string) => (state: RootState) =>
  R.pathOr(defaultConnectionState.loading, [VALKEY.KEYS.name, id, "loading"], state)

export const selectError = (id: string) => (state: RootState) =>
  R.pathOr(defaultConnectionState.error, [VALKEY.KEYS.name, id, "error"], state)

export const selectKeyBrowserState = (id: string) => (state: RootState) =>
  R.pathOr(defaultConnectionState, [VALKEY.KEYS.name, id], state)

// For key type
export const selectKeyTypeLoading = (id: string) => (state: RootState) =>
  R.pathOr(defaultConnectionState.keyTypeLoading, [VALKEY.KEYS.name, id, "keyTypeLoading"], state)

export const selectKeyTypeLoadingForKey = (id: string, key: string) => (state: RootState) =>
  R.pathOr(false, [VALKEY.KEYS.name, id, "keyTypeLoading", key], state)

export const selectKeyType = (id: string, keyName: string | null | undefined) => (state: RootState) => {
  if (!keyName) return undefined

  const keys = selectKeys(id)(state)
  return keys.find((k) => k.name === keyName)?.type
}

export const selectKeyTTL = (id: string, keyName: string | null | undefined) => (state: RootState) => {
  if (!keyName) return undefined

  const keys = selectKeys(id)(state)
  return keys.find((k) => k.name === keyName)?.ttl
}

export const selectKeySize = (id: string, keyName: string | null | undefined) => (state: RootState) => {
  if (!keyName) return undefined

  const keys = selectKeys(id)(state)
  return keys.find((k) => k.name === keyName)?.size
}

export const selectKeyCollectionSize = (id: string, keyName: string | null | undefined) => (state: RootState) => {
  if (!keyName) return undefined

  const keys = selectKeys(id)(state)
  return keys.find((k) => k.name === keyName)?.collectionSize
}

export const selectSortOption = (id: string) => (state: RootState) =>
  R.pathOr(defaultConnectionState.sortOption, [VALKEY.KEYS.name, id, "sortOption"], state)
