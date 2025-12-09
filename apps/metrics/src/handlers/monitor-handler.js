import { getCollectorMeta } from "../init-collectors.js"
import { ACTION, MONITOR, MODE } from "../utils/constants.js"
import { calculateHotKeysFromMonitor } from "./analyzers/calculate-hot-keys.js"
import { startMonitor, stopMonitor } from "../init-collectors.js"
import { enrichHotKeys } from "./analyzers/enrich-hot-keys.js"

const readMonitorMetadata = () => getCollectorMeta(MONITOR)
const toResponse = ({ isRunning, willCompleteAt }) => ({
  monitorRunning: isRunning,
  checkAt: willCompleteAt,
})

export const useMonitor = async (req, res) => {
  let monitorResponse = {}
  const { isRunning, willCompleteAt: checkAt } = getCollectorMeta(MONITOR) 
  try {
    if (!isRunning) {
      monitorResponse = await monitorHandler(ACTION.START, cfg)
      return res.json(monitorResponse)
    }
    if (Date.now() > checkAt) {
      const hotKeys = await Streamer.monitor().then(calculateHotKeysFromMonitor).then(enrichHotKeys(client))
      if (req.query.mode !== MODE.CONTINUOUS) {
        await monitorHandler(ACTION.STOP, cfg) 
      }
      monitorResponse = await monitorHandler(ACTION.STATUS, cfg)
      return res.json({ hotKeys, ...monitorResponse })
    }
    return res.json({ checkAt })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}

const monitorHandler = async (action, cfg) => {
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
    console.error(`[monitor] ${action} error:`, e)
    return { error: e.message }
  }
}

