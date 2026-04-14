import { GlideClusterClient } from "@valkey/valkey-glide"
import { EndpointType } from "valkey-common"
import { VALKEY } from "valkey-common"
import { connectToValkey, teardownConnection  } from "../connection"
import { unsubscribe, getWatcherCount } from "../node-watchers"
import { type Deps, withDeps } from "./utils"
import { setClusterDashboardData } from "../set-dashboard-data"

export interface ConnectionDetails {
  host: string;
  port: string;
  username?: string;
  password?: string;
  tls: boolean;
  verifyTlsCertificate: boolean;
  //TODO: Add handling and UI for uploading cert
  caCertPath?: string;
  endpointType: EndpointType;
  authType?: "password" | "iam";
  awsRegion?: string;
  awsReplicationGroupId?: string;
}

type ConnectPayload = {
  connectionDetails: ConnectionDetails,
  connectionId: string,
  isRetry?: boolean,
}

export const connectPending = withDeps<Deps, void>(
  async ({ ws, clients, action, connectedNodesByCluster, metricsServerMap, clusterNodesRegistry }) => {
    await connectToValkey(ws, action.payload as ConnectPayload, clients, connectedNodesByCluster, metricsServerMap, clusterNodesRegistry)
  },
)

export const resetConnection = withDeps<Deps, void>(
  async ({ ws, connectionId, clients, action }) => {
    const entry = clients.get(connectionId)

    if (!entry) {
      throw new Error("Client not found")
    }

    const { client } = entry

    const { clusterId } = action.payload as unknown as { clusterId: string }

    if (client instanceof GlideClusterClient) {
      await setClusterDashboardData(clusterId, client, ws, connectionId)
    }
  },
)

export const closeConnection = withDeps<Deps, void>(
  async ({ ws, clients, action, metricsServerMap, connectedNodesByCluster }) => {
    const { connectionId } = action.payload
    const connection = clients.get(connectionId)
    const clusterId = connection?.clusterId

    unsubscribe(connectionId, ws)

    // Always ack the requesting client — UI needs confirmation
    ws.send(JSON.stringify({
      type: VALKEY.CONNECTION.closeConnectionFulfilled,
      payload: { connectionId },
    }))

    if (getWatcherCount(connectionId) > 0) {
      return
    }
    const nodes = connectedNodesByCluster.get(clusterId!)

    // Remove node from cluster map accordingly
    if (clusterId && nodes) {
      if (nodes.length === 1) {
        connectedNodesByCluster.delete(clusterId)
      } else {
        const index = nodes.indexOf(connectionId)
        if (index !== -1) {
          nodes.splice(index, 1)
        }
      }
    }
    teardownConnection(connectionId, clients, metricsServerMap)
  },
)
