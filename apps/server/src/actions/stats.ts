import { toNodeId } from "valkey-common"
import { type Deps, withDeps, collectorFeaturesDisabled, KUBERNETES_METRICS_UNAVAILABLE } from "./utils"
import { sendSetDataError, setDashboardData } from "../set-dashboard-data"

export const setData = withDeps<Deps, void>(
  async ({ ws, metricsServerMap, connectionId }) => {
    if (collectorFeaturesDisabled()) {
      sendSetDataError(ws, connectionId, new Error(KUBERNETES_METRICS_UNAVAILABLE))
      return
    }
    const metricsServerURI = metricsServerMap.get(toNodeId(connectionId))?.metricsURI
    await setDashboardData(connectionId, metricsServerURI, ws)
  },
)
