import { GlideClient, GlideClusterClient } from "@valkey/valkey-glide"
import { VALKEY } from "common/src/constants"
import WebSocket from "ws"
import { parseInfo } from "./utils"

export async function sendValkeyRunCommand(
  client: GlideClient | GlideClusterClient,
  ws: WebSocket,
  payload: { command: string; connectionId: string },
) {
  try {
    let response = (await client.customCommand(
      payload.command.split(" "),
    ))

    if (typeof response === "string") {
      if (response.includes("ResponseError")) {
        ws.send(
          JSON.stringify({
            meta: { command: payload.command },
            type: VALKEY.COMMAND.sendFailed,
            payload: response,
          }),
        )
      }
      response = parseInfo(response)
    }

    ws.send(
      JSON.stringify({
        meta: {
          connectionId: payload.connectionId,
          command: payload.command,
        },
        type: VALKEY.COMMAND.sendFulfilled,
        payload: response,
      }),
    )
  } catch (err) {
    ws.send(
      JSON.stringify({
        meta: {
          connectionId: payload.connectionId,
          command: payload.command,
        },
        type: VALKEY.COMMAND.sendFailed,
        payload: err,
      }),
    )
    console.log("Error sending command to Valkey", err)
  }
}
