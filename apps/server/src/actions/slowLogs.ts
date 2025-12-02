import { type WebSocket } from "ws"
import { VALKEY } from "../../../../common/src/constants"
import { withDeps, Deps } from "./utils"

type SlowLogsResponse = {
  count: number
  rows: Array<{
    ts: number
    metric: string
    values: Array<{
      id: string
      ts: number
      duration_us: number
      argv: string[]
      addr: string
      client: string
    }>
  }>,
  checkAt: number
}

const sendSlowLogsFulfilled = (
  ws: WebSocket,
  connectionId: string,
  parsedResponse: SlowLogsResponse,
) => {
  ws.send(
    JSON.stringify({
      type: VALKEY.SLOWLOGS.slowLogsFulfilled,
      payload: {
        connectionId,
        parsedResponse,
      },
    }),
  )
}

const sendSlowLogsError = (
  ws: WebSocket,
  connectionId: string,
  error: unknown,
) => {
  console.log(error)
  ws.send(
    JSON.stringify({
      type: VALKEY.SLOWLOGS.slowLogsError,
      payload: {
        connectionId,
        error: error instanceof Error ? error.message : String(error),
      },
    }),
  )
}

export const slowLogsRequested = withDeps<Deps, void>(
  async ({ ws, metricsServerURIs, action }) => {
    const { connectionIds } = action.payload
    const promises = connectionIds.map(async (connectionId: string) => {
      const metricsServerURI = metricsServerURIs.get(connectionId)
      try {
        const count = 50 
        const url = `${metricsServerURI}/slowlog?count=${count}`
        console.log("[slowLogsRequested] Fetching from:", url)

        const initialResponse = await fetch(url)
        const initialParsedResponse: SlowLogsResponse = await initialResponse.json() as SlowLogsResponse
        if (initialParsedResponse.checkAt) {
          const delay = Math.max(initialParsedResponse.checkAt - Date.now(), 0)
          // Schedule the follow-up request for when the monitor cycle finishes
          setTimeout(async () => {
            try {
              const dataResponse = await fetch(`${metricsServerURI}/slowlog?count=${count}`)
              const dataParsedResponse = await dataResponse.json() as SlowLogsResponse
              sendSlowLogsFulfilled(ws, connectionId, dataParsedResponse)
            } catch (error) {
              sendSlowLogsError(ws, connectionId, error)
            }
          }, delay)
        }
        else {
          sendSlowLogsFulfilled(ws, connectionId, initialParsedResponse)
        }

      } catch (error) {
        sendSlowLogsError(ws, connectionId, error)
      }
      
    })
    await Promise.all(promises)
  })
