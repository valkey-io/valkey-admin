import { VALKEY } from "common/src/constants"
import { type WebSocket } from "ws"
import { Deps, withDeps } from "./utils"

export const updateConfig = withDeps<Deps, void>(
  async ({ ws, metricsServerURIs, action }) => {
    const { connectionIds, config } = action.payload
    const promises = connectionIds.map(async (connectionId: string) => {
      const metricsServerURI = metricsServerURIs.get(connectionId)
      const url = new URL("/update-config", metricsServerURI)
      try {
        const response = await fetch(url.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(config),
        })

        const parsedResponse = await response.json() 
        if (response.ok) {
          sendUpdateFulfilled(ws, connectionId, parsedResponse)
        } else {
          sendUpdateError(ws, connectionId, parsedResponse)
        }

      } catch (error) {
        const normalizedError = {
          success: false,
          message: error instanceof Error ? error.message : String(error),
          data: error,
        }
        sendUpdateError(ws, connectionId, normalizedError)
      }
    })
    await Promise.all(promises)

  },
     
)

const sendUpdateFulfilled = (
  ws: WebSocket,
  connectionId: string,
  parsedResponse,
) => {
  ws.send(
    JSON.stringify({
      type: VALKEY.CONFIG.updateConfigFulfilled,
      payload: {
        connectionId,
        response: parsedResponse,
      },
    }),
  )
}

const sendUpdateError = (
  ws: WebSocket,
  connectionId: string,
  parsedResponse,
) => {
  ws.send(
    JSON.stringify({
      type: VALKEY.CONFIG.updateConfigFailed,
      payload: {
        connectionId,
        response: parsedResponse,
      },
    }),
  )
}
