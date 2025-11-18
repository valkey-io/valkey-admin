import { GlideClient, GlideClusterClient, ConnectionError, ClosingError, TimeoutError } from "@valkey/valkey-glide"
import WebSocket from "ws"
import { VALKEY } from "../../../common/src/constants"
import { parseResponse } from "./utils"

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
      response = parseResponse(response)
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
    console.error(`Valkey command error for ${payload.connectionId}:`, err)

    // Send command failure
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

    // valkey connection issue. Only triggered when actual connection related error
    if (
      err instanceof ConnectionError || err instanceof TimeoutError || err instanceof ClosingError
    ) {
      ws.send(
        JSON.stringify({
          type: VALKEY.CONNECTION.connectRejected,
          payload: {
            connectionId: payload.connectionId,
            errorMessage: "Connection to Valkey instance lost",
          },
        }),
      )
    }

  }
}
