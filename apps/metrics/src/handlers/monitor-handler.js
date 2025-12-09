import { getCollectorMeta } from "../init-collectors.js"
import { ACTION, MONITOR } from "../utils/constants.js"
import { startMonitor, stopMonitor } from "../init-collectors.js"
const readMonitorMetadata = () => getCollectorMeta(MONITOR)
const toResponse = ({ isRunning, willCompleteAt }) => ({
  monitorRunning: isRunning,
  checkAt: willCompleteAt,
})

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
    console.error(`[monitor] ${action} error:`, e)
    return { error: e.message }
  }
}

