import { type WebSocket } from "ws"
import { VALKEY } from "valkey-common"
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
  console.error(error)
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
  async ({ ws, metricsServerMap, action, clusterNodesMap }) => {
    const { connectionId, clusterId, lfuEnabled, clusterSlotStatsEnabled, monitorEnabled } = action.payload
    const connectionIds = clusterId ? clusterNodesMap.get(clusterId as string) ?? [] : [connectionId]
    
    const promises = connectionIds.map(async (connectionId: string) => {
      const metricsServerURI = metricsServerMap.get(connectionId)?.metricsURI
      if (!metricsServerURI) {
        // We could sendHotKeysError here similar to below, but in another PR
        console.warn("Metrics server not started for node: ", connectionId)
        return
      }
      const url = new URL("/hot-keys", metricsServerURI)
      if (clusterSlotStatsEnabled && lfuEnabled) url.searchParams.set("useHotSlots", "true")
      else if (!monitorEnabled) {
        sendHotKeysError(
          ws,
          connectionId,
          "To collect hotkeys, you must either have monitoring enabled in Settings " +
          "or use an LFU eviction policy with cluster-slot-stats enabled",
        )
        return 
      }
      try {
        console.debug("[Hot keys] Fetching from:", url.href)
        const initialResponse = await fetch(url)
        if (!initialResponse.ok) {
          const errorBody = await initialResponse.json() as { error?: string }
          sendHotKeysError(ws, connectionId, errorBody.error ?? `HTTP ${initialResponse.status}`)
          return
        }
        const initialParsedResponse: HotKeysResponse = await initialResponse.json() as HotKeysResponse
        // Reads monitor data and returns when to fetch results (`checkAt`).
        if (initialParsedResponse.checkAt) {
          const delay = initialParsedResponse.checkAt - Date.now()
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
