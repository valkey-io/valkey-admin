import { type Deps, withDeps } from "./utils"
import { setDashboardData } from "../set-dashboard-data"

export const setData = withDeps<Deps, void>(
  async ({ ws, metricsServerMap, connectionId }) => {
    const metricsServerURI = metricsServerMap.get(connectionId)?.metricsURI
    await setDashboardData(connectionId, metricsServerURI, ws)
  },
)
