import { GlideClient, GlideClusterClient, Decoder } from "@valkey/valkey-glide"
import { VALKEY } from "common/src/constants"
import WebSocket from "ws"
import { parseClusterInfo, parseInfo } from "./utils"

export async function setDashboardData(
  connectionId: string,
  client: GlideClient,
  ws: WebSocket,
) {
  const rawInfo = await client.info()
  const info = parseInfo(rawInfo)
  const rawMemoryStats = (await client.customCommand(["MEMORY", "STATS"], {
    decoder: Decoder.String,
  })) as Array<{
    key: string;
    value: string;
  }>

  const memoryStats = rawMemoryStats.reduce((acc, { key, value }) => {
    acc[key] = value
    return acc
  }, {} as Record<string, string>)

  ws.send(
    JSON.stringify({
      type: VALKEY.STATS.setData,
      payload: {
        connectionId,
        info: info,
        memory: memoryStats,
      },
    }),
  )
}

export async function setClusterDashboardData(
  clusterId: string,
  client: GlideClusterClient,
  ws: WebSocket,
) {
  const rawInfo = await client.info({ route:"allNodes" })
  const info = parseClusterInfo(rawInfo)
  
  ws.send(
    JSON.stringify({
      type: VALKEY.CLUSTER.setClusterData,
      payload: {
        clusterId,
        info: info,
      },
    }),
  )
}
