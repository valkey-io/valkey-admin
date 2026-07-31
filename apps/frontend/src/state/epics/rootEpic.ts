import { merge } from "rxjs"
import { wsConnectionEpic } from "./wsEpics"
import {
  connectionEpic,
  sendRequestEpic,
  persistCommandsEpic,
  setDataEpic,
  deleteConnectionEpic,
  updateConnectionDetailsEpic,
  autoReconnectEpic,
  autoResumeEpic,
  valkeyRetryEpic,
  getHotKeysEpic,
  getBigKeysEpic,
  getCommandLogsEpic,
  updateConfigEpic,
  getCpuUsageEpic,
  getMemoryUsageEpic,
  monitorEpic,
  metricsReadinessRetryEpic
} from "./valkeyEpics"
import { keyBrowserEpic } from "./keyBrowserEpic"
import type { Store } from "@reduxjs/toolkit"

export const registerEpics = (store: Store) => {
  merge(
    wsConnectionEpic(store),
    connectionEpic(store),
    autoReconnectEpic(store),
    autoResumeEpic(store),
    valkeyRetryEpic(store),
    deleteConnectionEpic(),
    updateConnectionDetailsEpic(store),
    sendRequestEpic(),
    persistCommandsEpic(store),
    setDataEpic(store),
    getHotKeysEpic(store),
    getBigKeysEpic(),
    getCommandLogsEpic(),
    updateConfigEpic(),
    keyBrowserEpic(),
    getCpuUsageEpic(),
    getMemoryUsageEpic(),
    monitorEpic(),
    metricsReadinessRetryEpic(store),
  ).subscribe({
    error: (err) => console.error("Epic error:", err),
  })
}
