import { type WebSocket } from "ws"
import { VALKEY } from "../../../../common/src/constants"
import { withDeps, Deps } from "./utils"

interface MemoryMetric {
  description: string
  series: Array<{
    timestamp: number
    value: number
  }>
}

type MemoryUsageResponse = {
  [key: string]: MemoryMetric
}

type TimeRange = "1h" | "6h" | "12h"

const sendMemoryUsageFulfilled = (
  ws: WebSocket,
  connectionId: string,
  parsedResponse: MemoryUsageResponse,
) => {
  ws.send(
    JSON.stringify({
      type: VALKEY.MEMORY.memoryUsageFulfilled,
      payload: {
        connectionId,
        parsedResponse,
      },
    }),
  )
}

const sendMemoryUsageError = (
  ws: WebSocket,
  connectionId: string,
  error: unknown,
) => {
  console.log(error)
  ws.send(
    JSON.stringify({
      type: VALKEY.MEMORY.memoryUsageError,
      payload: {
        connectionId,
        error: error instanceof Error ? error.message : String(error),
      },
    }),
  )
}

type RequestPayload = {
  connectionIds: string[]
  timeRange?: string
}

export const memoryUsageRequested = withDeps<Deps, void>(
  async ({ ws, metricsServerURIs, action }) => {
    const { connectionIds, timeRange = "12h" } = action.payload as unknown as RequestPayload
    const promises = connectionIds.map(async (connectionId: string) => {
      const metricsServerURI = metricsServerURIs.get(connectionId)
      try {
        const hoursInMs = {
          "1h": 1 * 60 * 60 * 1000,
          "6h": 6 * 60 * 60 * 1000,
          "12h": 12 * 60 * 60 * 1000,
        }
        const since = Date.now() - hoursInMs[timeRange as TimeRange]

        const url = `${metricsServerURI}/memory?since=${since}&maxPoints=60`

        const response = await fetch(url)
        const parsedResponse: MemoryUsageResponse = await response.json() as MemoryUsageResponse

        sendMemoryUsageFulfilled(ws, connectionId, parsedResponse)
      } catch (error) {
        sendMemoryUsageError(ws, connectionId, error)
      }
    })
    await Promise.all(promises)
  })
