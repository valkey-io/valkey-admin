import { VALKEY } from "valkey-common"
import { sendValkeyRunCommand } from "../send-command"
import { type Deps, withDeps } from "./utils"
import { resolveClient } from "../utils"

type CommandAction = {
  command: string
  connectionId: string
}

export const sendRequested = withDeps<Deps, void>(
  async ({ ws, clients, connectionId, clusterNodesMap, action }) => {
    const connection = resolveClient(connectionId, clients, clusterNodesMap)

    if (connection) {
      await sendValkeyRunCommand(connection.client, ws, action.payload as CommandAction)
      return
    }

    ws.send(
      JSON.stringify({
        type: VALKEY.COMMAND.sendFailed,
        payload: {
          error: "Invalid connection Id",
        },
      }),
    )
  },
)
