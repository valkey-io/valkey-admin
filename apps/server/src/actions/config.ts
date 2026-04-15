import { type WebSocket } from "ws"
import { VALKEY } from "valkey-common"
import { Deps, withDeps, fetchWithTimeout } from "./utils"

interface ParsedResponse  {
  success: boolean, 
  statusCode?: number,
  message: string, 
  data: object
}

export const updateConfig = withDeps<Deps, void>(
  async ({ ws, metricsServerMap, action, connectedNodesByCluster }) => {
    const { connectionId, clusterId, config } = action.payload
    const connectionIds = clusterId ? connectedNodesByCluster.get(clusterId as string) ?? [] : [connectionId]

    const promises = connectionIds.map(async (connectionId: string) => {
      const metricsServerURI = metricsServerMap.get(connectionId)?.metricsURI

      if (!metricsServerURI) {
        const normalizedError = {
          success: false,
          message: "Metrics server URI not found",
          data: {},
        }
        sendUpdateError(ws, connectionId, normalizedError)
        return
      }

      try {
        const url = new URL("/update-config", metricsServerURI)
        const response = await fetchWithTimeout(url.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(config),
        })

        const parsedResponse = await response.json() as ParsedResponse
        if (response.ok) {
          sendUpdateFulfilled(ws, connectionId, parsedResponse)
        } else {
          sendUpdateError(ws, connectionId, parsedResponse)
        }

      } catch (error) {
        const normalizedError = {
          success: false,
          message: error instanceof Error ? error.message : String(error),
          data: error as object,
        }
        sendUpdateError(ws, connectionId, normalizedError)
      }
    })
    await Promise.all(promises)

  },  
)

// TODO: Add frontend component to dispatch this
export const enableClusterSlotStats = withDeps<Deps, void>(
  async ({ clients, action, connectedNodesByCluster }) => {
    const { connectionId, clusterId } = action.payload
    const connectionIds = clusterId ? connectedNodesByCluster.get(clusterId as string) ?? [] : [connectionId]
    
    const promises = connectionIds.map(async (connectionId: string) => {
      const connection = clients.get(connectionId)
      await connection?.client?.customCommand(["CONFIG", "SET", "cluster-slot-stats-enabled", "yes"])
    })
    await Promise.all(promises)
  },
)

const sendUpdateFulfilled = (
  ws: WebSocket,
  connectionId: string,
  parsedResponse: ParsedResponse,
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
  parsedResponse: ParsedResponse,
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
