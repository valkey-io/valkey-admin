import { VALKEY, findBlockedCommand, findReadOnlyBlockedCommand, parseCommandArgs } from "valkey-common"
import { sendValkeyRunCommand } from "../send-command"
import { type Deps, withDeps } from "./utils"

type CommandAction = {
  command: string
  connectionId: string
  readOnly?: boolean
}

export const sendRequested = withDeps<Deps, void>(
  async ({ ws, clients, connectionId, action }) => {
    const payload = action.payload as CommandAction

    const parsedArgs = parseCommandArgs(payload.command)
    const blocked = findBlockedCommand(parsedArgs)
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

    if (payload.readOnly) {
      const readOnlyBlocked = findReadOnlyBlockedCommand(parsedArgs)
      if (readOnlyBlocked) {
        ws.send(
          JSON.stringify({
            meta: { command: payload.command, connectionId: payload.connectionId },
            type: VALKEY.COMMAND.sendFailed,
            payload: `Command blocked: ${readOnlyBlocked.reason}`,
          }),
        )
        return
      }
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
