import { type WebSocket } from "ws"
import { VALKEY, COMMANDLOG_TYPE } from "valkey-common"
import * as R from "ramda"
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

type CommandLogResponse = (CommandLogsLargeResponse | CommandLogsSlowResponse) & { nodeId?: string }

type NodeError = { connectionId: string; error: string }

const sendCommandLogsFulfilled = (
  ws: WebSocket,
  connectionId: string,
  parsedResponse: CommandLogsSlowResponse | CommandLogsLargeResponse,
  commandLogType: CommandLogType,
  nodeErrors?: NodeError[],
) => {
  ws.send(
    JSON.stringify({
      type: VALKEY.COMMANDLOGS.commandLogsFulfilled,
      payload: {
        connectionId,
        parsedResponse,
        commandLogType,
        ...(nodeErrors?.length ? { nodeErrors } : {}),
      },
    }),
  )
}

const sendCommandLogsError = (
  ws: WebSocket,
  connectionId: string,
  error: unknown,
) => {
  console.error(error)
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

const fetchCommandLogs = async (metricsServerURI: string, commandLogType: CommandLogType): Promise<CommandLogResponse> => {
  const url = `${metricsServerURI}/commandlog?type=${commandLogType}`
  const initialResponse = await fetch(url)
  const parsed: CommandLogResponse = await initialResponse.json() as CommandLogResponse
  if (parsed.checkAt) {
    const delay = parsed.checkAt - Date.now()
    await new Promise((resolve) => setTimeout(resolve, delay))
    const dataResponse = await fetch(url)
    return await dataResponse.json() as CommandLogResponse
  }
  return parsed
}

export const commandLogsRequested = withDeps<Deps, void>(
  async ({ ws, metricsServerMap, action, clusterNodesRegistry }) => {
    const { connectionId, clusterId } = action.payload
    const commandLogType: CommandLogType = action.payload.commandLogType as CommandLogType

    const nodes = typeof clusterId === "string" ? clusterNodesRegistry[clusterId] : undefined
    const connectionIds = nodes ? Object.keys(nodes) : [connectionId]

    const promises = connectionIds.map(async (nodeId: string) => {
      const metricsServerURI = metricsServerMap.get(nodeId)?.metricsURI
      if (!metricsServerURI) {
        if (!nodes) sendCommandLogsError(ws, nodeId, new Error("Metrics server URI not found"))
        return { connectionId: nodeId, error: "Metrics server not started" } as NodeError
      }
      try {
        console.debug(`[Command Logs ${commandLogType}] Fetching from:`, metricsServerURI)
        return await fetchCommandLogs(metricsServerURI, commandLogType)
      } catch (error) {
        if (!nodes) sendCommandLogsError(ws, nodeId, error)
        return { connectionId: nodeId, error: error instanceof Error ? error.message : String(error) } as NodeError
      }
    })

    const settled = await Promise.all(promises)
    const results = settled.filter((r): r is CommandLogResponse & { connectionId: string } => !!r && "rows" in r)
    const nodeErrors = nodes ? settled.filter((r): r is NodeError => !!r && "error" in r) : []

    if (!nodes) {
      if (results[0]) sendCommandLogsFulfilled(ws, connectionId, results[0], commandLogType)
      return
    }

    const aggregatedRows = R.sort(
      R.descend(R.prop("ts")),
      results.flatMap((r) => r.rows.map((row) => ({ ...row, nodeId: r.nodeId }))),
    )
    const count = results[0]?.count ?? 0
    sendCommandLogsFulfilled(
      ws,
      clusterId as string,
      { rows: aggregatedRows, count, checkAt: 0 } as CommandLogResponse,
      commandLogType,
      nodeErrors,
    )
  })
