import { merge } from "rxjs"
import { wsConnectionEpic } from "./wsEpics"
import {
  connectionEpic,
  sendRequestEpic,
  setDataEpic,
  deleteConnectionEpic,
  updateConnectionDetailsEpic,
  autoReconnectEpic,
  valkeyRetryEpic,
  getHotKeysEpic,
  getCommandLogsEpic,
  updateConfigEpic,
  getCpuUsageEpic,
  getMemoryUsageEpic
} from "./valkeyEpics"
import { keyBrowserEpic } from "./keyBrowserEpic"
import type { Store } from "@reduxjs/toolkit"

export const registerEpics = (store: Store) => {
  merge(
    wsConnectionEpic(store),
    connectionEpic(store),
    autoReconnectEpic(store),
    valkeyRetryEpic(store),
    deleteConnectionEpic(),
    updateConnectionDetailsEpic(store),
    sendRequestEpic(),
    setDataEpic(store),
    getHotKeysEpic(store),
    getCommandLogsEpic(store),
    updateConfigEpic(store),
    keyBrowserEpic(),
    getCpuUsageEpic(store),
    getMemoryUsageEpic(store),
  ).subscribe({
    error: (err) => console.error("Epic error:", err),
  })
}
