import { type WebSocket } from "ws"
import { VALKEY } from "valkey-common"
import * as R from "ramda"
import { withDeps, Deps } from "./utils"

type HotKeysResponse = {
  nodeId: string
  hotKeys: [[]]
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
  async ({ ws, metricsServerMap, action, clusterNodesRegistry }) => {
    const { connectionId, clusterId, lfuEnabled, clusterSlotStatsEnabled } = action.payload
    
    const nodes =
      typeof clusterId === "string"
        ? clusterNodesRegistry[clusterId]
        : undefined

    const connectionIds = nodes
      ? Object.keys(nodes)
      : [connectionId]
    
    const promises = connectionIds.map(async (connectionId: string) => {
      const metricsServerURI = metricsServerMap.get(connectionId)?.metricsURI
      if (!metricsServerURI) {
        // We could sendHotKeysError here similar to below, but in another PR
        console.warn("Metrics server not started for node: ", connectionId)
        return
      }
      const url = new URL("/hot-keys", metricsServerURI)
      if (clusterSlotStatsEnabled && lfuEnabled) url.searchParams.set("useHotSlots", "true")
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
          await new Promise((resolve) => setTimeout(resolve, delay))
          const dataResponse = await fetch(`${metricsServerURI}/hot-keys`)
          return await dataResponse.json() as HotKeysResponse
        }
        else {
          return initialParsedResponse
        }
      } catch (error) {
        sendHotKeysError(ws, connectionId, error)
        return
      }
    })
    const results = (await Promise.all(promises)).filter((r): r is HotKeysResponse => !!r?.hotKeys)

    if (results.length === 0) return

    if (!nodes) {
      sendHotKeysFulfilled(ws, connectionId, results[0])
      return
    }

    const aggregatedHotKeys = R.pipe(
      R.chain(({ hotKeys }: HotKeysResponse) => hotKeys as unknown as [string, number][]),
      R.reduce((acc, [key, count]: [string, number]) => ({
        ...acc,
        [key]: (acc[key] ?? 0) + count,
      }), {} as Record<string, number>),
      R.toPairs,
      R.sort(([, a]: [string, number], [, b]: [string, number]) => b - a),
    )(results)
    const { monitorRunning, checkAt, nodeId } = results[0]
    sendHotKeysFulfilled(ws, clusterId as string, { hotKeys: aggregatedHotKeys, monitorRunning, checkAt, nodeId } as unknown as HotKeysResponse)
  })
