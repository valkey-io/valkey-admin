import { GlideClient, GlideClusterClient } from "@valkey/valkey-glide"
import { type Deps, withDeps } from "./utils"
import { setDashboardData } from "../set-dashboard-data"
import { resolveClient } from "../utils"

export const setData = withDeps<Deps, void>(
  async ({ ws, clients, connectionId, clusterNodesMap, action }) => {
    const connection = resolveClient(connectionId, clients, clusterNodesMap)
    const { address } = action.payload
    await setDashboardData(connectionId, connection?.client as GlideClient | GlideClusterClient, ws, address as {host: string, port: number} )
  },
)
