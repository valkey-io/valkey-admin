import { type WebSocket } from "ws"
import { VALKEY } from "../../../../common/src/constants"
import { withDeps, Deps } from "./utils"

type CpuUsageResponse = Array<{
  timestamp: number
  value: number
}>

type TimeRange = "1h" | "6h" | "12h"

const sendCpuUsageFulfilled = (
  ws: WebSocket,
  connectionId: string,
  parsedResponse: CpuUsageResponse,
) => {
  ws.send(
    JSON.stringify({
      type: VALKEY.CPU.cpuUsageFulfilled,
      payload: {
        connectionId,
        parsedResponse,
      },
    }),
  )
}

const sendCpuUsageError = (
  ws: WebSocket,
  connectionId: string,
  error: unknown,
) => {
  console.log(error)
  ws.send(
    JSON.stringify({
      type: VALKEY.CPU.cpuUsageError,
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

export const cpuUsageRequested = withDeps<Deps, void>(
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

        const url = `${metricsServerURI}/cpu?since=${since}&maxPoints=120`

        const response = await fetch(url)
        const parsedResponse: CpuUsageResponse = await response.json() as CpuUsageResponse

        sendCpuUsageFulfilled(ws, connectionId, parsedResponse)
      } catch (error) {
        sendCpuUsageError(ws, connectionId, error)
      }
    })
    await Promise.all(promises)
  })
