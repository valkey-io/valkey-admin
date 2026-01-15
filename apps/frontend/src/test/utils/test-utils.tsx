import React from "react"
import { render } from "@testing-library/react"
import { Provider } from "react-redux"
import { BrowserRouter } from "react-router"
import { configureStore } from "@reduxjs/toolkit"
import { VALKEY } from "@common/src/constants"
import type { RenderOptions } from "@testing-library/react"
import type { ReactElement } from "react"
import wsConnectionReducer from "@/state/wsconnection/wsConnectionSlice"
import valkeyConnectionReducer from "@/state/valkey-features/connection/connectionSlice"
import clusterReducer from "@/state/valkey-features/cluster/clusterSlice"
import valkeyCommandReducer from "@/state/valkey-features/command/commandSlice"
import valkeyInfoReducer from "@/state/valkey-features/info/infoSlice"
import keyBrowserReducer from "@/state/valkey-features/keys/keyBrowserSlice"
import hotKeysReducer from "@/state/valkey-features/hotkeys/hotKeysSlice"
import commandLogsReducer from "@/state/valkey-features/commandlogs/commandLogsSlice"

interface ExtendedRenderOptions extends Omit<RenderOptions, "wrapper"> {
  preloadedState?: object
  store?: ReturnType<typeof setupTestStore>
  initialRoute?: string
}

export function setupTestStore(preloadedState?: object) {
  return configureStore({
    reducer: {
      websocket: wsConnectionReducer,
      [VALKEY.CONNECTION.name]: valkeyConnectionReducer,
      [VALKEY.COMMAND.name]: valkeyCommandReducer,
      [VALKEY.STATS.name]: valkeyInfoReducer,
      [VALKEY.KEYS.name]: keyBrowserReducer,
      [VALKEY.CLUSTER.name]: clusterReducer,
      [VALKEY.HOTKEYS.name]: hotKeysReducer,
      [VALKEY.COMMANDLOGS.name]: commandLogsReducer,
    },
    preloadedState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        thunk: false,
        // Disable serializability checks for tests
        serializableCheck: false,
      }),
  })
}

export function renderWithProviders(
  ui: ReactElement,
  {
    preloadedState,
    store = setupTestStore(preloadedState),
    initialRoute = "/",
    ...renderOptions
  }: ExtendedRenderOptions = {},
) {
  window.history.pushState({}, "Test page", initialRoute)

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <Provider store={store}>
        <BrowserRouter>{children}</BrowserRouter>
      </Provider>
    )
  }

  return {
    store,
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  }
}

export { renderWithProviders as render }
