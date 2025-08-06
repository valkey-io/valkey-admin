import { configureStore } from "@reduxjs/toolkit";
import wsConnectionReducer from "./features/wsconnection/wsConnectionSlice";
import valkeyConnectionReducer from "./features/valkeyconnection/valkeyConnectionSlice";
import valkeyCommandReducer from "./features/valkeycommand/valkeycommandSlice";
import { wsMiddleware } from "./middleware/ws/wsMiddleware";
import { valkeyConnectMiddlware } from "./middleware/valkey/valkeyMiddleware";

export const store = configureStore({
    reducer: {
        websocket: wsConnectionReducer,
        valkeyconnection: valkeyConnectionReducer,
        valkeycommand: valkeyCommandReducer
    },
    middleware: getDefaultMiddleware => {
        return getDefaultMiddleware().concat(wsMiddleware, valkeyConnectMiddlware)
    }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch