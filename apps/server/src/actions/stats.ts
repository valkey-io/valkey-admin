import { GlideClient } from "@valkey/valkey-glide"
import { type Deps, withDeps } from "./utils.ts"
import { setDashboardData } from "../setDashboardData.ts"

export const setData = withDeps<Deps, void>(
  async ({ ws, clients, connectionId }) => {
    const client = clients.get(connectionId)

    if (client instanceof GlideClient)
      await setDashboardData(connectionId, client, ws)
  },
)
