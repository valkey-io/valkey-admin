import { GlideClusterClient } from "@valkey/valkey-glide"
import { EndpointType } from "valkey-common"
import { VALKEY } from "valkey-common"
import { closeMetricsServer, connectToValkey, teardownConnection  } from "../connection"
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
}

type ConnectPayload = {
  connectionDetails: ConnectionDetails,
  connectionId: string
}

export const connectPending = withDeps<Deps, void>(
  async ({ ws, clients, action, clusterNodesMap, metricsServerMap }) => {
    await connectToValkey(ws, action.payload as ConnectPayload, clients, clusterNodesMap, metricsServerMap)
  },
)

export const resetConnection = withDeps<Deps, void>(
  async ({ ws, connectionId, clients, action }) => {
    const client = clients.get(connectionId)

    const { clusterId } = action.payload as unknown as { clusterId: string }

    if (client instanceof GlideClusterClient) {
      await setClusterDashboardData(clusterId, client, ws, connectionId)
    }
  },
)

export const closeConnection = withDeps<Deps, void>(
  async ({ ws, clients, action, metricsServerMap, clusterNodesMap }) => {
    const { connectionId } = action.payload
    const connection = clients.get(connectionId)
    const clusterId = connection?.clusterId

    unsubscribe(connectionId, ws)

    // Always ack the requesting client — UI needs confirmation
    ws.send(JSON.stringify({
      type: VALKEY.CONNECTION.closeConnectionFulfilled,
      payload: { connectionId },
    }))

    const nodes = clusterNodesMap.get(clusterId!)
    if (process.env.USE_CLUSTER_ORCHESTRATOR !== "true") {
      closeMetricsServer(connectionId, metricsServerMap)
    }
    // Remove node from cluster map accordingly
    if (clusterId && nodes) {
      if (nodes.length === 1) {
        clusterNodesMap.delete(clusterId)
      } else {
        const index = nodes.indexOf(connectionId)
        if (index !== -1) {
          nodes.splice(index, 1)
        }
      }
    }

    if (getWatcherCount(connectionId) > 0) {
      return
    }
    teardownConnection(connectionId, clients, metricsServerMap)
  },
)
