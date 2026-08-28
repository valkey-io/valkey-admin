import { getConfig, updateConfig } from "../config.js"
import { ACTION, MONITOR } from "../utils/constants.js"
import { monitorHandler, readMonitorMetadata } from "./monitor-handler.js"

/**
 * `POST /update-config`: apply a validated set of per-epic tuning patches.
 *
 * Validation, the field allowlist and the atomic write all live in
 * `config.js`; this handler owns the HTTP shape and the one side effect the
 * config write cannot do for itself. A running monitor has already baked its
 * settings into the live stream, so it has to be restarted whenever its own
 * settings were part of the update. The restart is unconditional for a
 * successful `monitor` patch — it does not compare old and new values.
 */
export const updateConfigHandler = async (req, res) => {
  try {
    const result = updateConfig(req.body)

    if (result.success && Object.hasOwn(result.data.epics, MONITOR)) {
      const { isRunning } = readMonitorMetadata()
      if (isRunning) {
        await monitorHandler(ACTION.STOP, getConfig())
        await monitorHandler(ACTION.START, getConfig())
      }
    }

    return res.status(result.statusCode).json(result)
  }
  catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
      data: error,
    })
  }
}
