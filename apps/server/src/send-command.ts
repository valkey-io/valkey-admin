import { GlideClient, GlideClusterClient, ConnectionError, ClosingError, TimeoutError } from "@valkey/valkey-glide"
import WebSocket from "ws"
import { VALKEY } from "../../../common/src/constants"
import { parseResponse } from "./utils"

export const isRequestError = (x: unknown): x is Error | string =>
  x instanceof Error ||
  (typeof x === "string" && x.startsWith("ResponseError:"))

export async function sendValkeyRunCommand(
  client: GlideClient | GlideClusterClient,
  ws: WebSocket,
  payload: { command: string; connectionId: string },
) {
  try {
    const response = await client.customCommand(payload.command.split(" "))
    const isError = isRequestError(response)

    ws.send(
      JSON.stringify({
        meta: {
          command: payload.command,
          connectionId: payload.connectionId,
        },
        type: isError
          ? VALKEY.COMMAND.sendFailed
          : VALKEY.COMMAND.sendFulfilled,
        payload: isError
          ? response
          : parseResponse(response),
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
          type: VALKEY.CONNECTION.connectionBroken,
          payload: {
            connectionId: payload.connectionId,
            errorMessage: "Connection to Valkey instance lost",
          },
        }),
      )
    }

  }
}
