import { GlideClusterClient } from "@valkey/valkey-glide"
import { type Deps, withDeps } from "./utils.ts"
import { setClusterDashboardData } from "../setDashboardData.ts"

export const setClusterData = withDeps<Deps, void>(
  async ({ ws, clients, connectionId, action }) => {
    const client = clients.get(connectionId)

    if (client instanceof GlideClusterClient) {
      const { clusterId } = action.payload as unknown as { clusterId: string }
      await setClusterDashboardData(clusterId, client, ws)
    }
  },
)
