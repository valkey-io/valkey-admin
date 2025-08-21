import { configureStore } from "@reduxjs/toolkit";
import wsConnectionReducer from "@/state/wsconnection/wsConnectionSlice";
import valkeyConnectionReducer from "@/state/valkey-features/connection/valkeyConnectionSlice";
import valkeyCommandReducer from "@/state/valkey-features/command/valkeyCommandSlice.ts";
import valkeyInfoReducer from "@/state/valkey-features/info/valkeyInfoSlice";
import { wsMiddleware } from "@/state/middleware/ws/wsMiddleware";
import { valkeyMiddleware } from "@/state/middleware/valkey/valkeyMiddleware";
import {VALKEY} from "@common/src/constants.ts"

export const store = configureStore({
    reducer: {
        websocket: wsConnectionReducer,
        [VALKEY.CONNECTION.name]: valkeyConnectionReducer,
        [VALKEY.COMMAND.name]: valkeyCommandReducer,
        [VALKEY.STATS.name]: valkeyInfoReducer
    },
    middleware: getDefaultMiddleware => {
        return getDefaultMiddleware().concat(wsMiddleware, valkeyMiddleware)
    },
    devTools: process.env.NODE_ENV !== 'production',
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch