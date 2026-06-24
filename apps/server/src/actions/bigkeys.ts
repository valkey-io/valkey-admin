import { type WebSocket } from "ws"
import { VALKEY } from "valkey-common"
import * as R from "ramda"
import { withDeps, Deps } from "./utils"
import { toMetricsNodeId } from "../metrics-orchestrator"

type BigKey = {
  key: string
  sizeBytes: number
  type: string
  ttl: number
  nodeId?: string
}

type BigKeysResponse = {
  nodeId: string
  keys: BigKey[]
  scanned: number
  totalKeys: number
}

type NodeError = {
  connectionId: string
  error: string
}

// Scan-policy defaults, always forwarded to the metrics nodes.
// batchSize is left to the metrics layer's own default.
const DEFAULT_TOP_N = 50
const DEFAULT_SCAN_LIMIT = 10000

const sendBigKeysFulfilled = (
  ws: WebSocket,
  connectionId: string,
  parsedResponse: BigKeysResponse,
  nodeErrors?: NodeError[],
) => {
  ws.send(
    JSON.stringify({
      type: VALKEY.BIGKEYS.bigKeysFulfilled,
      payload: {
        connectionId,
        parsedResponse,
        ...(nodeErrors?.length ? { nodeErrors } : {}),
      },
    }),
  )
}

const sendBigKeysError = (
  ws: WebSocket,
  connectionId: string,
  error: unknown,
) => {
  console.error(error)
  ws.send(
    JSON.stringify({
      type: VALKEY.BIGKEYS.bigKeysError,
      payload: {
        connectionId,
        error: error instanceof Error ? error.message : String(error),
      },
    }),
  )
}

export const bigKeysRequested = withDeps<Deps, void>(
  async ({ ws, metricsServerMap, action, clusterNodesRegistry }) => {
    const { connectionId, clusterId, scanLimit, topN } = action.payload

    // Resolve once so every node and the merge cap use the same value.
    const effectiveTopN = Number(topN) || DEFAULT_TOP_N
    const effectiveScanLimit = Number(scanLimit) || DEFAULT_SCAN_LIMIT

    const nodes =
      typeof clusterId === "string"
        ? clusterNodesRegistry[clusterId]
        : undefined

    const connectionIds = nodes ? Object.keys(nodes) : [connectionId]

    const promises = connectionIds.map(async (connectionId: string) => {
      const metricsServerURI = metricsServerMap.get(toMetricsNodeId(connectionId))?.metricsURI
      if (!metricsServerURI) {
        if (!nodes) {
          console.warn("Metrics server not started for node: ", connectionId)
          return
        }
        return { connectionId, error: "Metrics server not started" } as NodeError
      }
      const url = new URL("/big-keys", metricsServerURI)
      url.searchParams.set("scanLimit", String(effectiveScanLimit))
      url.searchParams.set("topN", String(effectiveTopN))
      try {
        console.debug("[Big keys] Fetching from:", url.href)
        const response = await fetch(url)
        if (!response.ok) {
          const errorBody = await response.json() as { error?: string }
          if (!nodes) {
            sendBigKeysError(ws, connectionId, errorBody.error ?? `HTTP ${response.status}`)
            return
          }
          return { connectionId, error: errorBody.error ?? `HTTP ${response.status}` } as NodeError
        }
        return await response.json() as BigKeysResponse
      } catch (error) {
        if (!nodes) {
          sendBigKeysError(ws, connectionId, error)
          return
        }
        return { connectionId, error: error instanceof Error ? error.message : String(error) } as NodeError
      }
    })

    const settled = await Promise.all(promises)
    const results = settled.filter((r): r is BigKeysResponse => !!r && "keys" in r)
    const nodeErrors = nodes ? settled.filter((r): r is NodeError => !!r && "error" in r) : []

    if (results.length === 0) {
      if (nodes) {
        const emptyResponse: BigKeysResponse = { keys: [], scanned: 0, totalKeys: 0, nodeId: "" }
        sendBigKeysFulfilled(ws, clusterId as string, emptyResponse, nodeErrors)
      }
      return
    }

    if (!nodes) {
      // Tag each key with the node it came from so the UI can show which node does it belong to
      const single = results[0]
      const keys = single.keys.map((k) => ({ ...k, nodeId: single.nodeId }))
      sendBigKeysFulfilled(ws, connectionId, { ...single, keys })
      return
    }

    // for cluster merge every node's keys, keep the globally largest top N,
    // each key carries the nodeId it lives on.
    const mergedKeys = R.pipe(
      R.chain((res: BigKeysResponse) => res.keys.map((k): BigKey => ({ ...k, nodeId: res.nodeId }))),
      R.sort<BigKey>(R.descend((k) => k.sizeBytes)),
      R.take(effectiveTopN),
    )(results) as BigKey[]
    const scanned = R.sum(results.map((r) => r.scanned))
    const totalKeys = R.sum(results.map((r) => r.totalKeys))
    const aggregatedResponse: BigKeysResponse = { keys: mergedKeys, scanned, totalKeys, nodeId: clusterId as string }
    sendBigKeysFulfilled(ws, clusterId as string, aggregatedResponse, nodeErrors)
  })
