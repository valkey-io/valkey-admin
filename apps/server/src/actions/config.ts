import { type WebSocket } from "ws"
import { VALKEY } from "../../../../common/src/constants"
import { Deps, withDeps } from "./utils"

interface ParsedResponse  {
  success: boolean, 
  statusCode?: number,
  message: string, 
  data: object
}

export const updateConfig = withDeps<Deps, void>(
  async ({ ws, metricsServerURIs, action, clusterNodesMap }) => {
    const { connectionId, clusterId, config } = action.payload
    const connectionIds = clusterId ? clusterNodesMap.get(clusterId as string) ?? [] : [connectionId]

    const promises = connectionIds.map(async (connectionId: string) => {
      const metricsServerURI = metricsServerURIs.get(connectionId)
      const url = new URL("/update-config", metricsServerURI)
      try {
        const response = await fetch(url.toString(), {
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
  async ({ clients, action, clusterNodesMap }) => {
    const { connectionId, clusterId } = action.payload
    const connectionIds = clusterId ? clusterNodesMap.get(clusterId as string) ?? [] : [connectionId]
    
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
