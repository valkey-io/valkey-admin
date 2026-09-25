import { createSlice, nanoid, type PayloadAction } from "@reduxjs/toolkit"
import type { KeyPageRequest } from "@common/src/key-browser"

interface KeyInfo {
  name: string;
  type?: string;
  ttl?: number;
  size?: number;
  collectionSize?: number;
}

interface KeyBrowserState {
  [connectionId: string]: {
    keys: KeyInfo[];
    cursor: string;
    loading: boolean;
    error: string | null;
    keyTypeLoading: { [key: string]: boolean };
    totalKeys: number;
    pageLoading: boolean;
    restartRequired: boolean;
    requestId?: string;
    pattern?: string;
    keyType?: string;
  };
}

export const defaultConnectionState = {
  keys: [],
  cursor: "0",
  loading: false,
  error: null,
  keyTypeLoading: {},
  totalKeys: 0,
  pageLoading: false,
  restartRequired: false,
  pattern: undefined as string | undefined,
  keyType: undefined as string | undefined,
}

const initialState: KeyBrowserState = {}

const keyBrowserSlice = createSlice({
  name: "keyBrowser",
  initialState,
  reducers: {
    loadMoreKeys: (state, action: PayloadAction<{ connectionId: string }>) => {
      const entry = state[action.payload.connectionId]
      if (entry && !entry.pageLoading) entry.error = null
    },
    getKeysRequested: {
      prepare: (payload: KeyPageRequest) => ({ payload: { ...payload, requestId: nanoid() } }),
      reducer: (
        state,
        action: PayloadAction<KeyPageRequest>,
      ) => {
        const { connectionId } = action.payload
        if (!state[connectionId]) {
          state[connectionId] = { ...defaultConnectionState }
        }
        const entry = state[connectionId]
        entry.requestId = action.payload.requestId
        entry.pattern = action.payload.pattern
        entry.keyType = action.payload.keyType
        entry.pageLoading = true
        entry.restartRequired = false
        entry.loading = !action.payload.cursor || action.payload.cursor === "0"
        if (entry.loading) {
          entry.keys = []
          entry.cursor = "0"
        }
        state[connectionId].error = null
      },
    },
    getKeysFulfilled: (
      state,
      action: PayloadAction<{
        connectionId: string;
        keys: KeyInfo[];
        cursor: string;
        totalKeys: number;
        requestId?: string;
      }>,
    ) => {
      const { connectionId, keys, cursor, totalKeys } = action.payload
      if (state[connectionId]) {
        if (action.payload.requestId && action.payload.requestId !== state[connectionId].requestId) return
        state[connectionId].loading = false
        state[connectionId].pageLoading = false
        state[connectionId].keys = [...new Map([...state[connectionId].keys, ...keys].map((key) => [key.name, key])).values()]
          .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
        state[connectionId].cursor = cursor
        state[connectionId].totalKeys = totalKeys
      }
    },
    getKeysFailed: (
      state,
      action: PayloadAction<{
        connectionId: string;
        error: string;
        requestId?: string;
        restartRequired?: boolean;
      }>,
    ) => {
      const { connectionId, error } = action.payload
      if (state[connectionId]) {
        if (action.payload.requestId && action.payload.requestId !== state[connectionId].requestId) return
        state[connectionId].loading = false
        state[connectionId].pageLoading = false
        state[connectionId].error = error
        state[connectionId].restartRequired = action.payload.restartRequired ?? false
      }
    },
    getKeyTypeRequested: (
      state,
      action: PayloadAction<{ connectionId: string; key: string }>,
    ) => {
      const { connectionId, key } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = { ...defaultConnectionState }
      }
      state[connectionId].keyTypeLoading[key] = true
    },
    getKeyTypeFulfilled: (
      state,
      action: PayloadAction<{
        connectionId: string;
        key: string;
        keyType: string;
        ttl: number;
        size: number;
        collectionSize?: number;
      }>,
    ) => {
      const { connectionId, key, keyType, ttl, size, collectionSize } =
        action.payload
      if (!state[connectionId]) {
        state[connectionId] = { ...defaultConnectionState }
      }
      const existingKey = state[connectionId].keys.find(
        (k) => k.name === key,
      )
      if (existingKey) {
        existingKey.type = keyType
        existingKey.ttl = ttl
        if (size !== undefined) existingKey.size = size
        if (collectionSize !== undefined)
          existingKey.collectionSize = collectionSize
      } else {
        state[connectionId].keys.push({
          name: key, type: keyType, ttl, size,
          ...(collectionSize !== undefined ? { collectionSize } : {}),
        })
      }
      delete state[connectionId].keyTypeLoading[key]
    },
    getKeyTypeFailed: (
      state,
      action: PayloadAction<{
        connectionId: string;
        key: string;
        error: string;
      }>,
    ) => {
      const { connectionId, key } = action.payload
      if (state[connectionId]) {
        delete state[connectionId].keyTypeLoading[key]
      }
    },
    deleteKeyRequested: (
      state,
      action: PayloadAction<{ connectionId: string; key: string }>,
    ) => {
      const { connectionId, key } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = { ...defaultConnectionState }
      }
      state[connectionId].keyTypeLoading[key] = true
    },
    deleteKeyFulfilled: (
      state,
      action: PayloadAction<{
        connectionId: string;
        key: string;
        deleted: boolean;
      }>,
    ) => {
      const { connectionId, key, deleted } = action.payload
      if (state[connectionId]) {
        delete state[connectionId].keyTypeLoading[key]

        // remove key from keys array when deleted
        if (deleted && state[connectionId].keys) {
          state[connectionId].keys = state[connectionId].keys.filter(
            (keyInfo) => keyInfo.name !== key,
          )
        }
      }
    },
    deleteKeyFailed: (
      state,
      action: PayloadAction<{
        connectionId: string;
        key: string;
        error: string;
      }>,
    ) => {
      const { connectionId, key } = action.payload
      if (state[connectionId]) {
        delete state[connectionId].keyTypeLoading[key]
      }
    },
    addKeyRequested: (
      state,
      action: PayloadAction<{
        connectionId: string;
        key: string;
        keyType: string;
        value?: string;
        fields?: { field: string; value: string }[];
        values?: string[];
        zsetMembers?: { key: string; value: number }[];
        streamEntryId?: string;
        ttl?: number;
      }>,
    ) => {
      const { connectionId } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = { ...defaultConnectionState }
      }
      state[connectionId].loading = true
      state[connectionId].error = null
    },
    addKeyFulfilled: (
      state,
      action: PayloadAction<{
        connectionId: string;
        key: KeyInfo;
        message: string;
      }>,
    ) => {
      const { connectionId, key } = action.payload
      if (state[connectionId]) {
        state[connectionId].loading = false
        state[connectionId].keys = [...new Map([...state[connectionId].keys, key].map((item) => [item.name, item])).values()]
          .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
      }
    },
    addKeyFailed: (
      state,
      action: PayloadAction<{
        connectionId: string;
        error: string;
      }>,
    ) => {
      const { connectionId } = action.payload
      if (state[connectionId]) {
        state[connectionId].loading = false
      }
    },
    updateKeyRequested: (
      state,
      action: PayloadAction<{
        connectionId: string;
        key: string;
        keyType: string;
        value?: string;
        fields?: { field: string; value: string }[];
        deletedHashFields?: string[];
        listUpdates?: { index: number; value: string }[];
        deletedListItems?: { index: number; value: string }[];
        setUpdates?: { oldValue: string; newValue: string }[];
        deletedSetItems?: string[];
        newListItems?: string[];
        newSetItems?: string[];
        zsetUpdates?: { key: string; value: number }[];
        ttl?: number;
      }>,
    ) => {
      const { connectionId } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = { ...defaultConnectionState }
      }
      state[connectionId].loading = true
      state[connectionId].error = null
    },
    updateKeyFulfilled: (
      state,
      action: PayloadAction<{
        connectionId: string;
        key: KeyInfo;
        message: string;
      }>,
    ) => {
      const { connectionId, key } = action.payload
      if (state[connectionId]) {
        state[connectionId].loading = false
        const index = state[connectionId].keys.findIndex(
          (k) => k.name === key.name,
        )
        if (index !== -1) {
          state[connectionId].keys[index] = key
        }
      }
    },
    updateKeyFailed: (
      state,
      action: PayloadAction<{
        connectionId: string;
        error: string;
      }>,
    ) => {
      const { connectionId, error } = action.payload
      if (state[connectionId]) {
        state[connectionId].loading = false
        state[connectionId].error = error
      }
    },

  },
})

export default keyBrowserSlice.reducer
export const {
  loadMoreKeys,
  getKeysRequested,
  getKeysFulfilled,
  getKeysFailed,
  getKeyTypeRequested,
  getKeyTypeFulfilled,
  getKeyTypeFailed,
  deleteKeyRequested,
  deleteKeyFulfilled,
  deleteKeyFailed,
  addKeyRequested,
  addKeyFulfilled,
  addKeyFailed,
  updateKeyRequested,
  updateKeyFulfilled,
  updateKeyFailed,
} = keyBrowserSlice.actions
