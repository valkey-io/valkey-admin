import { sendValkeyRunCommand } from "../sendCommand.ts"
import { VALKEY } from "../../../../common/src/constants.ts"
import { type Deps, withDeps } from "./utils.ts"

type CommandAction = {
  command: string
  connectionId: string
}

export const sendRequested = withDeps<Deps, void>(
  async ({ ws, clients, connectionId, action }) => {
    const client = clients.get(connectionId!)

    if (client) {
      await sendValkeyRunCommand(client, ws, action.payload as CommandAction)
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
