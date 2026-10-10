import * as R from "ramda"
import { LOCAL_STORAGE } from "@common/src/constants.ts"
import type { Store } from "@reduxjs/toolkit"
import { secureStorage } from "@/utils/secureStorage.ts"
import {
  stripUnencryptedPassword,
  stripUnencryptedPasswords,
  type ConnectionState
} from "@/state/valkey-features/connection/connectionSlice.ts"

// Older builds saved passwords in cleartext on hosts with no OS keystore; drop them from state and disk.
export const purgeUnencryptedPasswords = async (store: Store): Promise<void> => {
  if (!secureStorage.isElectron() || await secureStorage.isEncryptionAvailable()) return

  store.dispatch(stripUnencryptedPasswords())

  const saved = localStorage.getItem(LOCAL_STORAGE.VALKEY_CONNECTIONS)
  if (saved === null) return
  const connections = JSON.parse(saved) as Record<string, ConnectionState>
  localStorage.setItem(
    LOCAL_STORAGE.VALKEY_CONNECTIONS,
    JSON.stringify(R.map(stripUnencryptedPassword, connections)),
  )
}
