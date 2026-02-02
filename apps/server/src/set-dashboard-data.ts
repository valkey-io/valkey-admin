import { GlideClient, GlideClusterClient, Decoder, RouteByAddress, ConnectionError, ClosingError, TimeoutError } from "@valkey/valkey-glide"
import WebSocket from "ws"
import { VALKEY } from "../../../common/src/constants"
import { parseClusterInfo, parseInfo } from "./utils"

export async function setDashboardData(
  connectionId: string,
  client: GlideClient | GlideClusterClient,
  ws: WebSocket,
  address?: {host: string, port: number},
) {
  try {
    let rawInfo
    if (client instanceof GlideClusterClient){
      const routeByAddressWithPortInHost: RouteByAddress = {
        type: "routeByAddress",
        host: `${address?.host}:${address?.port}`,
      }

      rawInfo = await client.info({ route: routeByAddressWithPortInHost })
    }
    else {
      rawInfo = await client.info()
    }
    const info = parseInfo(rawInfo as string)
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
  } catch (err) {
    if (
      err instanceof ConnectionError || err instanceof TimeoutError || err instanceof ClosingError
    ) {
      console.error(`Valkey connection error for ${connectionId}:`, err)
      ws.send(
        JSON.stringify({
          type: VALKEY.CONNECTION.connectRejected,
          payload: {
            connectionId,
            errorMessage: "Failed to fetch dashboard data - Valkey instance could be down",
          },
        }),
      )
    }
  }
}

export async function setClusterDashboardData(
  clusterId: string,
  client: GlideClusterClient,
  ws: WebSocket,
  connectionId: string,
) {
  try {
    const rawInfo = await client.info()
    const clusterInfo = parseClusterInfo(rawInfo)
  
    ws.send(
      JSON.stringify({
        type: VALKEY.CLUSTER.setClusterData,
        payload: {
          clusterId,
          info: clusterInfo,
        },
      }),
    )
  } catch (err) {
    if (
      err instanceof ConnectionError || err instanceof TimeoutError || err instanceof ClosingError
    ) {
      console.error(`Valkey connection error for ${connectionId}:`, err)
      ws.send(
        JSON.stringify({
          type: VALKEY.CONNECTION.connectRejected,
          payload: {
            connectionId,
            errorMessage: "Failed to fetch dashboard data - Valkey instance could be down",
          },
        }),
      )
    }

  }

}
