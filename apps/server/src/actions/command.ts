import { sendValkeyRunCommand } from "../send-command.ts"
import { VALKEY } from "../../../../common/src/constants.ts"
import { type Deps, withDeps } from "./utils.ts"

type CommandAction = {
  command: string
  connectionId: string
}

export const sendRequested = withDeps<Deps, void>(
  async ({ ws, clients, connectionId, action }) => {
    const connection = clients.get(connectionId!)

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
