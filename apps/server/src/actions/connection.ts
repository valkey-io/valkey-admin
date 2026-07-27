import { GlideClusterClient } from "@valkey/valkey-glide"
import { EndpointType, toNodeId } from "valkey-common"
import { VALKEY } from "valkey-common"
import { connectToValkey, teardownConnection  } from "../connection"
import { unsubscribe, getWatcherCount } from "../node-watchers"
import { type Deps, withDeps } from "./utils"
import { setClusterDashboardData } from "../set-dashboard-data"
import { authorizeConnection, isConnectionAuthorized, revokeConnection, hasAuthorizedSession } from "../session"

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
  /**
   * Logical Valkey database index.
   */
  db: number;
}

type ConnectPayload = {
  connectionDetails: ConnectionDetails,
  connectionId: string,
  isRetry?: boolean,
  isResume?: boolean,
}

export const connectPending = withDeps<Deps, void>(
  async ({ ws, clients, action, connectedNodesByCluster, metricsServerMap, clusterNodesRegistry, sessionId }) => {
    const payload = action.payload as ConnectPayload
    const { connectionId } = payload

    // if connection is being resumed, check if the session is still valid and if the connection exists
    if (payload.isResume && (!isConnectionAuthorized(sessionId, connectionId) || !clients.has(connectionId))) {
      ws.send(JSON.stringify({
        type: VALKEY.CONNECTION.connectRejected,
        payload: { connectionId, errorMessage: "Session expired. Please sign in again.", requiresAuth: true },
      }))
      return
    }

    const client = await connectToValkey(
      { clients, connectedNodesByCluster, clusterNodesRegistry, metricsServerMap },
      ws,
      payload,
    )

    if (client) {
      authorizeConnection(sessionId, connectionId)
      authorizeConnection(sessionId, toNodeId(connectionId))
    }
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
  async ({ ws, clients, action, metricsServerMap, connectedNodesByCluster, clusterNodesRegistry, sessionId }) => {
    const { connectionId } = action.payload
    const connection = clients.get(connectionId)
    const clusterId = connection?.clusterId

    revokeConnection(sessionId, connectionId)
    unsubscribe(connectionId, ws)

    // Always ack the requesting client — UI needs confirmation
    ws.send(JSON.stringify({
      type: VALKEY.CONNECTION.closeConnectionFulfilled,
      payload: { connectionId },
    }))

    // Don't tear down a shared connection another session still owns
    if (getWatcherCount(connectionId) > 0 || hasAuthorizedSession(connectionId)) {
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
    teardownConnection(
      { clients, clusterNodesRegistry, metricsServerMap },
      connectionId,
    )
  },
)
