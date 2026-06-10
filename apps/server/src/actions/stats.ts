import { type Deps, withDeps } from "./utils"
import { setDashboardData } from "../set-dashboard-data"
import { toMetricsNodeId } from "../metrics-orchestrator"

export const setData = withDeps<Deps, void>(
  async ({ ws, metricsServerMap, connectionId }) => {
    const metricsServerURI = metricsServerMap.get(toMetricsNodeId(connectionId))?.metricsURI
    await setDashboardData(connectionId, metricsServerURI, ws)
  },
)
