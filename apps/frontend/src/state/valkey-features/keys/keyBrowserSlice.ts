import { createSlice, type PayloadAction } from "@reduxjs/toolkit"

interface KeyInfo {
  key: string
  type?: string
  ttl?: number
}

interface KeyBrowserState {
  [connectionId: string]: {
    keys: KeyInfo[]
    cursor: string
    loading: boolean
    error: string | null
  }
}

export const defaultConnectionState = {
  keys: [],
  cursor: "0",
  loading: false,
  error: null
}

const initialState: KeyBrowserState = {}

const keyBrowserSlice = createSlice({
  name: "keyBrowser",
  initialState,
  reducers: {
    getKeysRequested: (state, action: PayloadAction<{ connectionId: string; pattern?: string; count?: number }>) => {
      const { connectionId } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = { ...defaultConnectionState }
      }
      state[connectionId].loading = true
      state[connectionId].error = null
    },
    getKeysFulfilled: (state, action: PayloadAction<{ 
      connectionId: string
      keys: string[]
      cursor: string 
    }>) => {
      const { connectionId, keys, cursor } = action.payload
      if (state[connectionId]) {
        state[connectionId].loading = false
        state[connectionId].keys = keys.map(key => ({ key }))
        state[connectionId].cursor = cursor
      }
    },
    getKeysFailed: (state, action: PayloadAction<{ 
      connectionId: string
      error: string 
    }>) => {
      const { connectionId, error } = action.payload
      if (state[connectionId]) {
        state[connectionId].loading = false
        state[connectionId].error = error
      }
    },
  }
})

export default keyBrowserSlice.reducer
export const { 
  getKeysRequested, 
  getKeysFulfilled, 
  getKeysFailed,
} = keyBrowserSlice.actions