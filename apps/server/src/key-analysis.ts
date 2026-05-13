import { WebSocket } from "ws"
import {
  GlideClient,
  GlideClusterClient,
  ConnectionError,
  TimeoutError,
  ClosingError,
  RouteOption,
} from "@valkey/valkey-glide"
import pLimit from "p-limit"
import { VALKEY } from "valkey-common"
import { buildScanCommandArgs } from "./valkey-client-commands"

interface AnalyzedKeyInfo {
  name: string
  type: string
  memoryUsage: number
  collectionSize: number | null
  ttl: number
}

type ClusterScanResult = {
  key: string
  value: [string, string[]]
}

const COLLECTION_SIZE_COMMANDS: Record<string, string> = {
  hash: "HLEN",
  list: "LLEN",
  set: "SCARD",
  zset: "ZCARD",
  stream: "XLEN",
}

async function analyzeKey(
  client: GlideClient | GlideClusterClient,
  key: string,
): Promise<AnalyzedKeyInfo> {
  try {
    const [keyType, memoryUsage, ttl] = await Promise.all([
      client.customCommand(["TYPE", key]) as Promise<string>,
      client.customCommand(["MEMORY", "USAGE", key]).catch(() => null) as Promise<number | null>,
      client.customCommand(["TTL", key]).catch(() => -1) as Promise<number>,
    ])

    const type = keyType.toLowerCase()
    const sizeCmd = COLLECTION_SIZE_COMMANDS[type]
    let collectionSize: number | null = null

    if (sizeCmd) {
      collectionSize = await (client.customCommand([sizeCmd, key]).catch(() => null)) as number | null
    }

    return {
      name: key,
      type: keyType,
      memoryUsage: memoryUsage || 0,
      collectionSize,
      ttl,
    }
  } catch {
    return { name: key, type: "unknown", memoryUsage: 0, collectionSize: null, ttl: -1 }
  }
}

async function scanStandaloneForAnalysis(
  client: GlideClient,
  limit: number,
  count: number,
): Promise<Set<string>> {
  const allKeys = new Set<string>()
  let cursor = "0"

  do {
    const scanResult = (await client.customCommand(
      buildScanCommandArgs({ cursor, count }),
    )) as [string, string[]]
    const [newCursor, keys] = scanResult
    cursor = newCursor
    keys.forEach((key) => {
      if (allKeys.size < limit) allKeys.add(key)
    })
  } while (allKeys.size < limit && cursor !== "0")

  return allKeys
}

async function scanClusterForAnalysis(
  client: GlideClusterClient,
  limit: number,
  count: number,
): Promise<Set<string>> {
  const routeOption: RouteOption = { route: "allPrimaries" }
  const allKeys = new Set<string>()

  const scanClusterResult = await client.customCommand(
    buildScanCommandArgs({ cursor: "0", count }),
    routeOption,
  ) as ClusterScanResult[]

  await Promise.all(
    scanClusterResult.map(async ({ key: nodeAddress, value }) => {
      let cursor = value[0]
      const keys = value[1]

      keys.forEach((k) => {
        if (allKeys.size < limit) allKeys.add(k)
      })

      const [host, portStr] = nodeAddress.split(/:(?=[^:]+$)/)
      const nodeRouteOption: RouteOption = {
        route: { type: "routeByAddress", host, port: Number(portStr) },
      }

      while (cursor !== "0" && allKeys.size < limit) {
        const [nextCursor, newKeys] = await client.customCommand(
          buildScanCommandArgs({ cursor, count }),
          nodeRouteOption,
        ) as [string, string[]]

        cursor = nextCursor
        newKeys.forEach((k) => {
          if (allKeys.size < limit) allKeys.add(k)
        })
      }
    }),
  )

  return allKeys
}

const concurrencyLimit = pLimit(20)

export async function analyzeKeys(
  client: GlideClient | GlideClusterClient,
  ws: WebSocket,
  payload: {
    connectionId: string
    limit?: number
    sampleCount?: number
  },
) {
  const { connectionId } = payload
  const scanLimit = payload.limit ?? 10000
  const sampleCount = payload.sampleCount ?? 200

  const sendProgress = (scannedCount: number, totalEstimated: number, phase: "scanning" | "enriching") => {
    ws.send(JSON.stringify({
      type: VALKEY.KEY_ANALYSIS.analysisProgress,
      payload: { connectionId, scannedCount, totalEstimated, phase },
    }))
  }

  const sendError = (err: unknown) => {
    ws.send(JSON.stringify({
      type: VALKEY.KEY_ANALYSIS.analysisError,
      payload: {
        connectionId,
        error: err instanceof Error ? err.message : String(err),
      },
    }))
  }

  try {
    const totalKeys = (await client.customCommand(["DBSIZE"])) as number

    sendProgress(0, totalKeys, "scanning")

    const allKeys = client instanceof GlideClusterClient
      ? await scanClusterForAnalysis(client, scanLimit, sampleCount)
      : await scanStandaloneForAnalysis(client, scanLimit, sampleCount)

    sendProgress(allKeys.size, totalKeys, "enriching")

    const keysArray = [...allKeys]
    let enrichedCount = 0

    const analyzedKeys = await Promise.all(
      keysArray.map((key) =>
        concurrencyLimit(async () => {
          const result = await analyzeKey(client, key)
          enrichedCount++
          if (enrichedCount % 500 === 0) {
            sendProgress(enrichedCount, keysArray.length, "enriching")
          }
          return result
        }),
      ),
    )

    analyzedKeys.sort((a, b) => b.memoryUsage - a.memoryUsage)

    const totalMemoryScanned = analyzedKeys.reduce((sum, k) => sum + k.memoryUsage, 0)

    ws.send(JSON.stringify({
      type: VALKEY.KEY_ANALYSIS.analysisFulfilled,
      payload: {
        connectionId,
        keys: analyzedKeys,
        totalKeys,
        scannedKeys: analyzedKeys.length,
        totalMemoryScanned,
      },
    }))
  } catch (err) {
    console.error(`Key analysis error for ${connectionId}:`, err)
    sendError(err)

    if (
      err instanceof ConnectionError || err instanceof TimeoutError || err instanceof ClosingError
    ) {
      ws.send(JSON.stringify({
        type: VALKEY.CONNECTION.connectRejected,
        payload: {
          connectionId,
          errorMessage: "Error during key analysis - Valkey instance could be down",
          shouldRetry: true,
        },
      }))
    }
  }
}
