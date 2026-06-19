import { COMMANDLOG_TYPE, COMMANDLOG_SLOW, COMMANDLOG_LARGE_REPLY, COMMANDLOG_LARGE_REQUEST } from "../utils/constants.js"
import { getCollectorMeta } from "../init-collectors.js"
import * as Streamer from "../effects/ndjson-streamer.js"

const collectorNameByType = {
  [COMMANDLOG_TYPE.SLOW]: COMMANDLOG_SLOW,
  [COMMANDLOG_TYPE.LARGE_REQUEST]: COMMANDLOG_LARGE_REQUEST,
  [COMMANDLOG_TYPE.LARGE_REPLY]: COMMANDLOG_LARGE_REPLY,
}

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
    const meta = getCollectorMeta(collectorNameByType[commandlogType])
    if (meta?.error) {
      return res.status(503).json({ error: meta.error })
    }
    const { lastUpdatedAt, nextCycleAt } = meta || {}
    if (lastUpdatedAt !== null) {
      const count = Number(req.query.count) || 100
      const rows = await getCommandLogRows(commandlogType)
      const limitedRows = Array.isArray(rows)
        ? rows.map((row) => ({ ...row, values: row.values?.slice(0, count) ?? [] })).filter((row) => row.values.length > 0)
        : rows
      // Add minimum (1) and maximum (500) boundaries for rows requested
      return res.json({ count: Math.max(1, Math.min(500, count)), rows: limitedRows, lastUpdatedAt, nodeId })
    }
    else return res.json({ checkAt: nextCycleAt, lastUpdatedAt })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
