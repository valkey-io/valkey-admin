import { createSlice } from "@reduxjs/toolkit";

const valkeycommandSlice = createSlice({
    name: 'valkeycommand',
    initialState: {
        lastCommand: "",
        response: "",
        loading: false,
        error: null
    },
    reducers: {
        setLastCommand: (state, action) => {
            state.lastCommand = action.payload
        },
        setResponse: (state, action) => {
            state.response = action.payload
        },
        setLoading: (state, action) => {
            state.loading = action.payload
        },
        setCommandError: (state, action) => {
            state.error = action.payload
        }
    }
})

export default valkeycommandSlice.reducer;
export const { setLastCommand, setResponse, setLoading, setCommandError } = valkeycommandSlice.actions