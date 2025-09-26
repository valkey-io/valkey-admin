import { merge } from "rxjs"
import { wsConnectionEpic } from "./wsEpics"
import { connectionEpic, sendRequestEpic, setDataEpic } from "./valkeyEpics"
import { keyBrowserEpic } from "./keyBrowserEpic"
import type { Store } from "@reduxjs/toolkit"

export const registerEpics = (store: Store) => {
  merge(
    wsConnectionEpic(store),
    connectionEpic(store),
    sendRequestEpic(),
    setDataEpic(),
    keyBrowserEpic()
  ).subscribe({
    error: (err) => console.error("Epic error:", err),
  })
}
