import { WebSocket } from "ws"
import { VALKEY } from "valkey-common"
import { analyzeKeys } from "../key-analysis"
import { type Deps, withDeps } from "./utils"

export const analysisRequested = withDeps<Deps, void>(
  async ({ ws, clients, connectionId, action }) => {
    const connection = clients.get(connectionId)
    if (connection) {
      await analyzeKeys(connection.client, ws, action.payload)
    } else {
      ws.send(
        JSON.stringify({
          type: VALKEY.KEY_ANALYSIS.analysisError,
          payload: {
            connectionId,
            error: "Invalid connection Id",
          },
        }),
      )
    }
  },
)
