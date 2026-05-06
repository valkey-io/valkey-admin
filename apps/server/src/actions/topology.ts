import { discoverTopology } from "../connection"
import { type ConnectionDetails } from "./connection"
import { type Deps, withDeps } from "./utils"

type DiscoveryPayload = {
  discoveryId: string
  connectionDetails: ConnectionDetails
}

export const topologyDiscoveryEndpointPending = withDeps<Deps, void>(
  async ({ ws, action }) => {
    await discoverTopology(ws, action.payload as unknown as DiscoveryPayload)
  },
)
