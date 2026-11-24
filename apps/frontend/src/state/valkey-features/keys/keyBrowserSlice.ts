import { createSlice, type PayloadAction } from "@reduxjs/toolkit"
import { connectionBroken } from "@/state/valkey-features/connection/connectionSlice"

interface KeyInfo {
  name: string;
  type?: string;
  ttl?: number;
  size?: number;
  collectionSize?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elements?: any;
  elementsWarning?: string;
  cursor?: string;
}

interface KeyBrowserState {
  [connectionId: string]: {
    keys: KeyInfo[];
    cursor: string;
    loading: boolean;
    error: string | null;
    keyTypeLoading: { [key: string]: boolean };
    elementsLoading: { [key: string]: boolean };
    totalKeys: number;
  };
}

// Called per connection so each gets its own nested objects, not frozen shared ones.
export const createConnectionState = (): KeyBrowserState[string] => ({
  keys: [],
  cursor: "0",
  loading: false,
  error: null,
  keyTypeLoading: {},
  elementsLoading: {},
  totalKeys: 0,
})

export const defaultConnectionState = createConnectionState()

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
        state[connectionId] = createConnectionState()
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
        state[connectionId] = createConnectionState()
      }
      state[connectionId].keyTypeLoading[key] = true
    },
    getKeyTypeFulfilled: (
      state,
      action: PayloadAction<
        {
          connectionId: string;
          key: string;
        } & Omit<KeyInfo, "name"> & { name?: string }
      >,
    ) => {
      const { connectionId, key, name, ...keyInfo } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = createConnectionState()
      }
      const updatedKey: KeyInfo = { name: name ?? key, ...keyInfo }
      const index = state[connectionId].keys.findIndex((k) => k.name === key)
      if (index === -1) {
        state[connectionId].keys.push(updatedKey)
      } else {
        state[connectionId].keys[index] = updatedKey
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
        state[connectionId] = createConnectionState()
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
        state[connectionId] = createConnectionState()
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
        count?: number;
      }>,
    ) => {
      const { connectionId } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = createConnectionState()
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
    getKeyElementsRequested: (
      state,
      action: PayloadAction<{
        connectionId: string;
        key: string;
        keyType: string;
        cursor: string;
      }>,
    ) => {
      const { connectionId, key } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = createConnectionState()
      }
      state[connectionId].elementsLoading[key] = true
    },
    getKeyElementsFulfilled: (
      state,
      action: PayloadAction<{
        connectionId: string;
        key: string;
        cursor: string;
        nextCursor?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        elements: any[];
        collectionSize: number;
      }>,
    ) => {
      const { connectionId, key, cursor, nextCursor, elements, collectionSize } = action.payload
      const connection = state[connectionId]
      if (!connection) return
      delete connection.elementsLoading[key]
      const target = connection.keys.find((k) => k.name === key)
      if (!target || !Array.isArray(target.elements) || target.cursor !== cursor) return
      const idOf = (element: string | { key: string }) => typeof element === "string" ? element : element.key
      const seen = target.type === "list" ? null : new Set(target.elements.map(idOf))
      target.elements.push(...(seen ? elements.filter((element) => !seen.has(idOf(element))) : elements))
      target.cursor = nextCursor
      target.collectionSize = collectionSize
    },
    getKeyElementsFailed: (
      state,
      action: PayloadAction<{
        connectionId: string;
        key: string;
        error: string;
      }>,
    ) => {
      const { connectionId, key } = action.payload
      if (state[connectionId]) {
        delete state[connectionId].elementsLoading[key]
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(connectionBroken, (state, { payload: { connectionId } }) => {
      if (state[connectionId]) {
        state[connectionId].elementsLoading = {}
      }
    })
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
  getKeyElementsRequested,
  getKeyElementsFulfilled,
  getKeyElementsFailed,
} = keyBrowserSlice.actions
