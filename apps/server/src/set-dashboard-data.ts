import { GlideClusterClient, ConnectionError, ClosingError, TimeoutError } from "@valkey/valkey-glide"
import WebSocket from "ws"
import { VALKEY } from "valkey-common"
import { parseClusterInfo } from "./utils"
import { fetchWithTimeout } from "./actions/utils"

type DashboardInfo = {
  info: Record<string, string>
  memory: Record<string, string>
}

const sendSetDataFulfilled = (
  ws: WebSocket,
  connectionId: string,
  { info, memory }: DashboardInfo,
) => {
  ws.send(
    JSON.stringify({
      type: VALKEY.STATS.setData,
      payload: {
        connectionId,
        info,
        memory,
      },
    }),
  )
}

const sendSetDataError = (
  ws: WebSocket,
  connectionId: string,
  error: unknown,
) => {
  console.error(error)
  ws.send(
    JSON.stringify({
      type: VALKEY.STATS.setError,
      payload: {
        connectionId,
        error: error instanceof Error ? error.message : String(error),
      },
    }),
  )
}

export async function setDashboardData(
  connectionId: string,
  metricsServerURI: string | undefined,
  ws: WebSocket,
) {
  if (!metricsServerURI) {
    sendSetDataError(ws, connectionId, new Error("Metrics server URI not found"))
    return
  }

  try {
    const response = await fetchWithTimeout(`${metricsServerURI}/info`)
    if (!response.ok) {
      throw new Error(`Metrics server responded with ${response.status}`)
    }
    const parsedResponse = (await response.json()) as DashboardInfo

    sendSetDataFulfilled(ws, connectionId, parsedResponse)
  } catch (error) {
    sendSetDataError(ws, connectionId, error)
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
            errorMessage: `Failed to fetch dashboard data: ${err.message}`,
            shouldRetry: true,
          },
        }),
      )
    }

  }

}
