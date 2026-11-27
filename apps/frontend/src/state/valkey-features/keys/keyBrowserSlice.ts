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
  isBinary?: boolean;
  binaryIndexes?: number[];
  binaryKeyIndexes?: number[];
  binaryValueIndexes?: number[];
  binaryStreamParts?: { entry: number; field: number; part: "field" | "value" }[];
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
        // Indexes of binary elements within this page's `elements`.
        binaryIndexes?: number[];
        binaryKeyIndexes?: number[];
        binaryValueIndexes?: number[];
      }>,
    ) => {
      const { connectionId, key, cursor, nextCursor, elements, collectionSize } = action.payload
      const connection = state[connectionId]
      if (!connection) return
      delete connection.elementsLoading[key]
      const target = connection.keys.find((k) => k.name === key)
      if (!target || !Array.isArray(target.elements) || target.cursor !== cursor) return
      const pageBinary = new Set(action.payload.binaryIndexes)
      const pageKeyBinary = new Set(action.payload.binaryKeyIndexes)
      const pageValueBinary = new Set(action.payload.binaryValueIndexes)
      // Binary members arrive escaped and can read like a text member, so the binary flag is part of the identity.
      const idOf = (element: string | { key: string }, isBinary: boolean) =>
        `${isBinary ? "b" : "t"}:${typeof element === "string" ? element : element.key}`
      const loadedBinary = new Set([...(target.binaryIndexes ?? []), ...(target.binaryKeyIndexes ?? [])])
      const seen = target.type === "list"
        ? null
        : new Set(target.elements.map((element: string | { key: string }, i: number) => idOf(element, loadedBinary.has(i))))
      elements.forEach((element, i) => {
        if (seen) {
          const id = idOf(element, pageBinary.has(i) || pageKeyBinary.has(i))
          if (seen.has(id)) return
          seen.add(id)
        }
        // Page indexes are shifted to where the element lands in the loaded list.
        const index = target.elements.push(element) - 1
        if (pageBinary.has(i)) target.binaryIndexes = [...(target.binaryIndexes ?? []), index]
        if (pageKeyBinary.has(i)) target.binaryKeyIndexes = [...(target.binaryKeyIndexes ?? []), index]
        if (pageValueBinary.has(i)) target.binaryValueIndexes = [...(target.binaryValueIndexes ?? []), index]
      })
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
