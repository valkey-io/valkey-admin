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

type NodeError = {
  connectionId: string
  error: string
}

const sendHotKeysFulfilled = (
  ws: WebSocket,
  connectionId: string,
  parsedResponse: HotKeysResponse,
  nodeErrors?: NodeError[],
) => {
  ws.send(
    JSON.stringify({
      type: VALKEY.HOTKEYS.hotKeysFulfilled,
      payload: {
        connectionId,
        parsedResponse,
        ...(nodeErrors?.length ? { nodeErrors } : {}),
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
        if (!nodes) {
          console.warn("Metrics server not started for node: ", connectionId)
          return
        }
        return { connectionId, error: "Metrics server not started" } as NodeError
      }
      const url = new URL("/hot-keys", metricsServerURI)
      if (clusterSlotStatsEnabled && lfuEnabled) url.searchParams.set("useHotSlots", "true")
      try {
        console.debug("[Hot keys] Fetching from:", url.href)
        const initialResponse = await fetch(url)
        if (!initialResponse.ok) {
          const errorBody = await initialResponse.json() as { error?: string }
          if (!nodes) {
            sendHotKeysError(ws, connectionId, errorBody.error ?? `HTTP ${initialResponse.status}`)
            return
          }
          return { connectionId, error: errorBody.error ?? `HTTP ${initialResponse.status}` } as NodeError
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
        if (!nodes) {
          sendHotKeysError(ws, connectionId, error)
          return
        }
        return { connectionId, error: error instanceof Error ? error.message : String(error) } as NodeError
      }
    })

    const settled = await Promise.all(promises)
    const results = settled.filter((r): r is HotKeysResponse => !!r && "hotKeys" in r)
    const nodeErrors = nodes ? settled.filter((r): r is NodeError => !!r && "error" in r) : []

    if (results.length === 0) {
      if (nodes) {
        const emptyResponse = { hotKeys: [], monitorRunning: false, checkAt: 0, nodeId: "" } as unknown as HotKeysResponse
        sendHotKeysFulfilled(ws, clusterId as string, emptyResponse, nodeErrors)
      }
      return
    }

    if (!nodes) {
      sendHotKeysFulfilled(ws, connectionId, results[0])
      return
    }

    type HotKeyTuple = [string, number, number | null, number, string]
    const aggregatedHotKeys = R.pipe(
      R.chain(({ hotKeys, nodeId: nId }: HotKeysResponse) =>
        (hotKeys as unknown as [string, number, number | null, number][]).map(
          ([key, count, size, ttl]) => [key, count, size, ttl, nId] as HotKeyTuple,
        ),
      ),
      R.reduce((acc: Record<string, HotKeyTuple>, [key, count, size, ttl, nId]: HotKeyTuple) => ({
        ...acc,
        [key]: [key, (acc[key]?.[1] ?? 0) + count, acc[key]?.[2] ?? size, acc[key]?.[3] ?? ttl, nId] as HotKeyTuple,
      }), {}),
      R.values,
      R.sort(R.descend(R.nth(1) as (x: HotKeyTuple) => number)),
    )(results)
    const { monitorRunning, checkAt, nodeId } = results[0]
    const aggregatedResponse = { hotKeys: aggregatedHotKeys, monitorRunning, checkAt, nodeId } as unknown as HotKeysResponse
    sendHotKeysFulfilled(ws, clusterId as string, aggregatedResponse, nodeErrors)
  })
