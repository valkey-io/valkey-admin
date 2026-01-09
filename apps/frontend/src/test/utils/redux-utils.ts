import { setupTestStore } from "./test-utils"
import type { UnknownAction } from "@reduxjs/toolkit"

/**
 * Creates a test store and dispatches a series of actions
 */
export function dispatchActions(actions: UnknownAction[], preloadedState?: object) {
  const store = setupTestStore(preloadedState)
  actions.forEach((action) => store.dispatch(action))
  return store
}

/**
 * Gets a specific slice from the test store
 */
export function getSlice<K extends keyof ReturnType<ReturnType<typeof setupTestStore>["getState"]>>(
  store: ReturnType<typeof setupTestStore>,
  sliceName: K,
) {
  return store.getState()[sliceName]
}
