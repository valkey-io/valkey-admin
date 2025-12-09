import { COMMANDLOG_TYPE } from "../utils/constants.js"
import { getCollectorMeta } from "../init-collectors.js"
import * as Streamer from "../effects/ndjson-streamer.js"
const getCommandLogRows = async (commandlogType, count) => {
  try {
    switch (commandlogType) {
      case COMMANDLOG_TYPE.SLOW:
        return Streamer.commandlog_slow({ limit: count })
      case COMMANDLOG_TYPE.LARGE_REQUEST:
        return Streamer.commandlog_large_request({ limit: count })
      case COMMANDLOG_TYPE.LARGE_REPLY:
        return Streamer.commandlog_large_reply({ limit: count })
      default:
        throw new Error(`Unknown commandlog type: ${commandlogType}`)
    }
  }
  catch (e) {
    console.error(`[commandlog] ${commandlogType} error:`, e)
    return { error: e.message }
  }
}

export const getCommandLogs = async (req, res) => {
  try {
    const commandlogType = req.query.type
    const { lastUpdatedAt, nextCycleAt } = getCollectorMeta(commandlogType) || {}
    if (lastUpdatedAt !== null) {
      const count = Number(req.query.count) || 50
      const rows = await getCommandLogRows(commandlogType, count)
      console.log("Rows from file:", rows)
      // Add minimum (1) and maximum (500) boundaries for rows requested
      return res.json({ count: Math.max(1, Math.min(500, count)), rows, lastUpdatedAt })
    }
    else return res.json({ checkAt: nextCycleAt, lastUpdatedAt })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
