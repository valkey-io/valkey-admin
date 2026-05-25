import { VALKEY, findBlockedCommand } from "valkey-common"
import { sendValkeyRunCommand } from "../send-command"
import { type Deps, withDeps } from "./utils"

type CommandAction = {
  command: string
  connectionId: string
}

export const sendRequested = withDeps<Deps, void>(
  async ({ ws, clients, connectionId, action }) => {
    const payload = action.payload as CommandAction

    const blocked = findBlockedCommand(payload.command)
    if (blocked) {
      ws.send(
        JSON.stringify({
          meta: { command: payload.command, connectionId: payload.connectionId },
          type: VALKEY.COMMAND.sendFailed,
          payload: `Command blocked: ${blocked.reason}`,
        }),
      )
      return
    }

    const connection = clients.get(connectionId!)

    if (connection) {
      sendValkeyRunCommand(connection.client, ws, payload)
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
