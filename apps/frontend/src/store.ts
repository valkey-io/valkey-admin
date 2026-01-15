import { configureStore } from "@reduxjs/toolkit"
import { VALKEY } from "@common/src/constants.ts"
import { rxjsMiddleware } from "./state/middleware/rxjsMiddleware/rxjsMiddlware"
import { registerEpics } from "./state/epics/rootEpic"
import wsConnectionReducer from "@/state/wsconnection/wsConnectionSlice"
import valkeyConnectionReducer from "@/state/valkey-features/connection/connectionSlice.ts"
import clusterReducer from "@/state/valkey-features/cluster/clusterSlice"
import valkeyCommandReducer from "@/state/valkey-features/command/commandSlice.ts"
import valkeyInfoReducer from "@/state/valkey-features/info/infoSlice.ts"
import keyBrowserReducer from "@/state/valkey-features/keys/keyBrowserSlice.ts"
import hotKeysReducer from "@/state/valkey-features/hotkeys/hotKeysSlice.ts"
import commandLogsReducer from "@/state/valkey-features/commandlogs/commandLogsSlice"
import configReducer from "@/state/valkey-features/config/configSlice"
import cpuReducer from "@/state/valkey-features/cpu/cpuSlice.ts"
import memoryReducer from "@/state/valkey-features/memory/memorySlice.ts"

export const store = configureStore({
  reducer: {
    websocket: wsConnectionReducer,
    [VALKEY.CONNECTION.name]: valkeyConnectionReducer,
    [VALKEY.COMMAND.name]: valkeyCommandReducer,
    [VALKEY.STATS.name]: valkeyInfoReducer,
    [VALKEY.KEYS.name]: keyBrowserReducer,
    [VALKEY.CLUSTER.name]: clusterReducer,
    [VALKEY.HOTKEYS.name]: hotKeysReducer,
    [VALKEY.COMMANDLOGS.name]: commandLogsReducer,
    [VALKEY.CONFIG.name]: configReducer,
    [VALKEY.CPU.name]: cpuReducer,
    [VALKEY.MEMORY.name]: memoryReducer,
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
