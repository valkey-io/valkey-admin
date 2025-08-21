import type { RootState } from "@/store.ts";
import {VALKEY} from "@common/src/constants.ts"

export const selectStatus = (state: RootState) => state[VALKEY.CONNECTION.name].status
export const selectConnected = (state: RootState) => state[VALKEY.CONNECTION.name].connected
export const selectConnecting = (state: RootState) => state[VALKEY.CONNECTION.name].connecting
export const selectRedirected = (state: RootState) => state[VALKEY.CONNECTION.name].hasRedirected
export const selectError = (state: RootState) => state[VALKEY.CONNECTION.name].status