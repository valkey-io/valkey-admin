import { type WebSocket } from "ws"
import { VALKEY } from "../../../../common/src/constants"
import { withDeps, Deps } from "./utils"

type HotKeysResponse = {
  nodeId: string
  hotkeys: [[]]
  checkAt: number
  monitorRunning: boolean
}

const sendHotKeysFulfilled = (
  ws: WebSocket,
  connectionId: string,
  parsedResponse: HotKeysResponse,
) => {
  ws.send(
    JSON.stringify({
      type: VALKEY.HOTKEYS.hotKeysFulfilled,
      payload: {
        connectionId,
        parsedResponse,
      },
    }),
  )
}

const sendHotKeysError = (
  ws: WebSocket,
  connectionId: string,
  error: unknown,
) => {
  console.log(error)
  ws.send(
    JSON.stringify({
      type: VALKEY.HOTKEYS.hotKeysError,
      payload: {
        connectionId,
        error: error instanceof Error ? error.message : String(error),
      },
    }),
  )
}

export const hotKeysRequested = withDeps<Deps, void>(
  async ({ ws, metricsServerURIs, action }) => {
    const { connectionIds } = action.payload
    const promises = connectionIds.map(async (connectionId: string) => {
      const metricsServerURI = metricsServerURIs.get(connectionId)
      try {
        const initialResponse = await fetch(`${metricsServerURI}/hot-keys`)
        const initialParsedResponse: HotKeysResponse = await initialResponse.json() as HotKeysResponse
        // Initial request starts monitoring and returns when to fetch results (`checkAt`).
        if (initialParsedResponse.checkAt) {
          const delay = Math.max(initialParsedResponse.checkAt - Date.now(), 0)
          // Schedule the follow-up request for when the monitor cycle finishes
          setTimeout(async () => {
            try {
              const dataResponse = await fetch(`${metricsServerURI}/hot-keys`)
              const dataParsedResponse = await dataResponse.json() as HotKeysResponse
              sendHotKeysFulfilled(ws, connectionId, dataParsedResponse)
            } catch (error) {
              sendHotKeysError(ws, connectionId, error)
            }
          }, delay)
        }
        else {
          sendHotKeysFulfilled(ws, connectionId, initialParsedResponse)
        }
      } catch (error) {
        sendHotKeysError(ws, connectionId, error)
      }
    })
    await Promise.all(promises)

  },
)
