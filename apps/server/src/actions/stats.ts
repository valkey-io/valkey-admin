import { GlideClient, GlideClusterClient } from "@valkey/valkey-glide"
import { type Deps, withDeps } from "./utils.ts"
import { setDashboardData } from "../set-dashboard-data.ts"

export const setData = withDeps<Deps, void>(
  async ({ ws, clients, connectionId, action }) => {
    const connection = clients.get(connectionId)
    const { address } = action.payload
    await setDashboardData(connectionId, connection?.client as GlideClient | GlideClusterClient, ws, address as {host: string, port: number} )
  },
)
