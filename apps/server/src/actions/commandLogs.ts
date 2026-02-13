import { type WebSocket } from "ws"
import { VALKEY, COMMANDLOG_TYPE } from "../../../../common/src/constants"
import { withDeps, Deps } from "./utils"

type CommandLogType = typeof COMMANDLOG_TYPE.SLOW | typeof COMMANDLOG_TYPE.LARGE_REQUEST | typeof COMMANDLOG_TYPE.LARGE_REPLY

type CommandLogsSlowResponse = {
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

type CommandLogsLargeResponse = {
  count: number
  rows: Array<{
    ts: number
    metric: string
    values: Array<{
      id: string
      ts: number
      size: number
      argv: string[]
      addr: string
      client: string
    }>
  }>,
  checkAt: number
}

type CommandLogResponse = CommandLogsLargeResponse | CommandLogsSlowResponse

const sendCommandLogsFulfilled = (
  ws: WebSocket,
  connectionId: string,
  parsedResponse: CommandLogsSlowResponse | CommandLogsLargeResponse,
  commandLogType: CommandLogType,
) => {
  ws.send(
    JSON.stringify({
      type: VALKEY.COMMANDLOGS.commandLogsFulfilled,
      payload: {
        connectionId,
        parsedResponse,
        commandLogType,
      },
    }),
  )
}

const sendCommandLogsError = (
  ws: WebSocket,
  connectionId: string,
  error: unknown,
) => {
  console.log(error)
  ws.send(
    JSON.stringify({
      type: VALKEY.COMMANDLOGS.commandLogsError,
      payload: {
        connectionId,
        error: error instanceof Error ? error.message : String(error),
      },
    }),
  )
}

export const commandLogsRequested = withDeps<Deps, void>(
  async ({ ws, metricsServerURIs, action, clusterNodesMap }) => {
    const { connectionId, clusterId } = action.payload
    const connectionIds = clusterId ? clusterNodesMap.get(clusterId as string) ?? [] : [connectionId]
    const commandLogType: CommandLogType = action.payload.commandLogType as CommandLogType
    
    const promises = connectionIds.map(async (connectionId: string) => {
      const metricsServerURI = metricsServerURIs.get(connectionId)
      try {
        const url = `${metricsServerURI}/commandlog?type=${commandLogType}`
        console.log(`[Command Logs ${commandLogType}] Fetching from:`, url)

        const initialResponse = await fetch(url)
        const initialParsedResponse: CommandLogResponse = await initialResponse.json() as CommandLogResponse
        if (initialParsedResponse.checkAt) {
          const delay = initialParsedResponse.checkAt - Date.now()
          // Schedule the follow-up request for when the monitor cycle finishes
          setTimeout(async () => {
            try {
              const dataResponse = await fetch(`${metricsServerURI}/commandlog?type=${commandLogType}`)
              const dataParsedResponse = await dataResponse.json() as CommandLogResponse
              sendCommandLogsFulfilled(ws, connectionId, dataParsedResponse, commandLogType)
            } catch (error) {
              sendCommandLogsError(ws, connectionId, error)
            }
          }, delay)
        }
        else {
          sendCommandLogsFulfilled(ws, connectionId, initialParsedResponse, commandLogType)
        }

      } catch (error) {
        sendCommandLogsError(ws, connectionId, error)
      }
      
    })
    await Promise.all(promises)
  })
