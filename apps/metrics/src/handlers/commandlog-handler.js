import { COMMANDLOG_TYPE } from "../utils/constants.js"
import { getCollectorMeta } from "../init-collectors.js"
import * as Streamer from "../effects/ndjson-streamer.js"

const latestByTsFold = () => ({
  seed: null,
  reducer: (acc, curr) => (acc == null || curr.ts > acc.ts ? curr : acc),
  finalize: (acc) => [acc],
})

const getCommandLogRows = async (commandlogType) => {
  try {
    switch (commandlogType) {
      case COMMANDLOG_TYPE.SLOW:
        return Streamer.commandlog_slow(latestByTsFold())
      case COMMANDLOG_TYPE.LARGE_REQUEST:
        return Streamer.commandlog_large_request(latestByTsFold())
      case COMMANDLOG_TYPE.LARGE_REPLY:
        return Streamer.commandlog_large_reply(latestByTsFold())
      default:
        throw new Error(`Unknown commandlog type: ${commandlogType}`)
    }
  }
  catch (e) {
    console.error(`[commandlog] ${commandlogType} error:`, e)
    return { error: e.message }
  }
}

export const getCommandLogs = async (req, res, nodeId) => {
  try {
    const commandlogType = req.query.type
    const { lastUpdatedAt, nextCycleAt } = getCollectorMeta(commandlogType) || {}
    if (lastUpdatedAt !== null) {
      const count = Number(req.query.count) || 100
      const rows = await getCommandLogRows(commandlogType)
      const limitedRows = Array.isArray(rows) ? rows.slice(-count) : rows
      // Add minimum (1) and maximum (500) boundaries for rows requested
      return res.json({ count: Math.max(1, Math.min(500, count)), rows: limitedRows, lastUpdatedAt, nodeId })
    }
    else return res.json({ checkAt: nextCycleAt, lastUpdatedAt })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
