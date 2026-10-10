import { GlideClient, GlideClusterClient, ConnectionError, ClosingError, TimeoutError } from "@valkey/valkey-glide"
import WebSocket from "ws"
import { VALKEY, parseCommandArgs } from "valkey-common"
import { parseResponse } from "./utils"

export const isRequestError = (x: unknown): x is Error | string =>
  x instanceof Error ||
  (typeof x === "string" && x.startsWith("ResponseError:"))

export { parseCommandArgs }

export async function sendValkeyRunCommand(
  client: GlideClient | GlideClusterClient,
  ws: WebSocket,
  payload: { command: string; connectionId: string },
) {
  let startTime: number | undefined
  try {
    const commandArgs = parseCommandArgs(payload.command)
    startTime = performance.now()
    const response = await client.customCommand(commandArgs)
    const durationMs = performance.now() - startTime
    const isError = isRequestError(response)

    ws.send(
      JSON.stringify({
        meta: {
          command: payload.command,
          connectionId: payload.connectionId,
          durationMs,
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
    const durationMs = startTime === undefined ? undefined : performance.now() - startTime
    console.error(`Valkey command error for ${payload.connectionId}:`, err)

    // Send command failure
    ws.send(
      JSON.stringify({
        meta: {
          connectionId: payload.connectionId,
          command: payload.command,
          ...(durationMs !== undefined && { durationMs }),
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
            shouldRetry: true,
          },
        }),
      )
    }

  }
}
