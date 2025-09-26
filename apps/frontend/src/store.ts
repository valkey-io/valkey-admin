import { configureStore } from "@reduxjs/toolkit"
import { VALKEY } from "@common/src/constants.ts"
import { rxjsMiddleware } from "./state/middleware/rxjsMiddleware/rxjsMiddlware"
import { registerEpics } from "./state/epics/rootEpic"
import wsConnectionReducer from "@/state/wsconnection/wsConnectionSlice"
import valkeyConnectionReducer from "@/state/valkey-features/connection/connectionSlice.ts"
import valkeyCommandReducer from "@/state/valkey-features/command/commandSlice.ts"
import valkeyInfoReducer from "@/state/valkey-features/info/infoSlice.ts"
import keyBrowserReducer from "@/state/valkey-features/keys/keyBrowserSlice.ts"

export const store = configureStore({
  reducer: {
    websocket: wsConnectionReducer,
    [VALKEY.CONNECTION.name]: valkeyConnectionReducer,
    [VALKEY.COMMAND.name]: valkeyCommandReducer,
    [VALKEY.STATS.name]: valkeyInfoReducer,
    [VALKEY.KEYS.name]: keyBrowserReducer,
  },
  middleware: (getDefaultMiddleware) => {
    return getDefaultMiddleware({
      thunk: false,
    }).concat(rxjsMiddleware)
  },
  devTools: process.env.NODE_ENV !== "production",
})

registerEpics(store)

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
