import { getCollectorMeta } from "../init-collectors.js"
import { ACTION, MONITOR } from "../utils/constants.js"
import { calculateHotKeysFromMonitor } from "../analyzers/calculate-hot-keys.js"
import { startMonitor, stopMonitor } from "../init-collectors.js"
import { enrichHotKeys } from "../analyzers/enrich-hot-keys.js"
import * as Streamer from "../effects/ndjson-streamer.js"

export const readMonitorMetadata = () => getCollectorMeta(MONITOR)

const toResponse = ({ isRunning, willCompleteAt }) => ({
  monitorRunning: isRunning,
  checkAt: willCompleteAt,
  startedAt: startedAt ?? null,
})

export const useMonitor = async (res, client) => {
  const { isRunning, willCompleteAt: checkAt } = getCollectorMeta(MONITOR) 
  try {
    if (!isRunning) {
      return res.status(400).json({ error: "Monitor is not running" })
    }
    if (Date.now() > checkAt) {
      const hotKeys = await Streamer.monitor().then(calculateHotKeysFromMonitor).then(enrichHotKeys(client))
      return res.json({ hotKeys, ...toResponse(getCollectorMeta(MONITOR)) })
    }
    return res.json({ checkAt })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}

export const monitorHandler = async (action, cfg) => {
  try {
    const meta = readMonitorMetadata()

    switch (action) {
      case ACTION.START:
        if (meta.isRunning) {
          return toResponse(meta)
        }

        await startMonitor(cfg)
        return toResponse(readMonitorMetadata())

      case ACTION.STOP:
        if (!meta.isRunning) {
          return toResponse(meta)
        }

        await stopMonitor()
        return toResponse(readMonitorMetadata())

      case ACTION.STATUS:
        return toResponse(meta)

      default:
        return { error: "Invalid action. Use ?action=start|stop|status" }
    }
  } catch (e) {
    console.error("[monitor] %s error:", e)
    return { error: e.message }
  }
}

