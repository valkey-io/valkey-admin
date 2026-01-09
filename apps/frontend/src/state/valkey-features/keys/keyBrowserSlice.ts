import { createSlice, type PayloadAction } from "@reduxjs/toolkit"

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
  };
}

export const defaultConnectionState = {
  keys: [],
  cursor: "0",
  loading: false,
  error: null,
  keyTypeLoading: {},
  totalKeys: 0,
}

const initialState: KeyBrowserState = {}

const keyBrowserSlice = createSlice({
  name: "keyBrowser",
  initialState,
  reducers: {
    getKeysRequested: (
      state,
      action: PayloadAction<{
        connectionId: string;
        pattern?: string;
        count?: number;
      }>,
    ) => {
      const { connectionId } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = { ...defaultConnectionState }
      }
      state[connectionId].loading = true
      state[connectionId].error = null
    },
    getKeysFulfilled: (
      state,
      action: PayloadAction<{
        connectionId: string;
        keys: KeyInfo[];
        cursor: string;
        totalKeys: number;
      }>,
    ) => {
      const { connectionId, keys, cursor, totalKeys } = action.payload
      if (state[connectionId]) {
        state[connectionId].loading = false
        state[connectionId].keys = keys
        state[connectionId].cursor = cursor
        state[connectionId].totalKeys = totalKeys
      }
    },
    getKeysFailed: (
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
      if (state[connectionId]) {
        const existingKey = state[connectionId].keys.find(
          (k) => k.name === key,
        )
        if (existingKey) {
          existingKey.type = keyType
          existingKey.ttl = ttl
          if (size !== undefined) existingKey.size = size
          if (collectionSize !== undefined)
            existingKey.collectionSize = collectionSize
        }
        delete state[connectionId].keyTypeLoading[key]
      }
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
        state[connectionId].keys.push(key)
      }
    },
    addKeyFailed: (
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
