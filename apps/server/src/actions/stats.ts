import { type Deps, withDeps } from "./utils"
import { setDashboardData } from "../set-dashboard-data"
import { toNodeId } from "valkey-common"

export const setData = withDeps<Deps, void>(
  async ({ ws, metricsServerMap, connectionId }) => {
    const metricsServerURI = metricsServerMap.get(toNodeId(connectionId))?.metricsURI
    await setDashboardData(connectionId, metricsServerURI, ws)
  },
)
