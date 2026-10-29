import { LOCAL_STORAGE } from "@common/src/constants"
import type { ConnectionState } from "./valkey-features/connection/connectionSlice"

// Single write path to localStorage. A password that could not be encrypted
// (isPasswordEncrypted === false) is never written to disk: it is dropped to
// undefined so the connection re-prompts on next use, and the transient flag is
// not persisted either. All persistence writes must go through this.
//
// This lives in its own module because both the connection slice (which
// migrates saved keys on load) and the epics write through it.
export const persistConnections = (connections: Record<string, ConnectionState>) => {
  const safe = Object.fromEntries(
    Object.entries(connections).map(([id, conn]) => {
      if (conn?.isPasswordEncrypted === false) {
        const stripped = { ...conn, connectionDetails: { ...conn.connectionDetails, password: undefined } }
        delete stripped.isPasswordEncrypted
        return [id, stripped]
      }
      return [id, conn]
    }),
  )
  localStorage.setItem(LOCAL_STORAGE.VALKEY_CONNECTIONS, JSON.stringify(safe))
}
