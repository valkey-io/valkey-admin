import { GlideClusterClient } from "@valkey/valkey-glide"
import { type Deps, withDeps } from "./utils.ts"
import { setClusterDashboardData } from "../set-dashboard-data.ts"

export const setClusterData = withDeps<Deps, void>(
  async ({ ws, clients, connectionId, action }) => {
    const connection = clients.get(connectionId)

    if (connection && connection.client instanceof GlideClusterClient) {
      const { clusterId } = action.payload 
      await setClusterDashboardData(clusterId as string, connection.client, ws, connectionId)
    }
  },
)
