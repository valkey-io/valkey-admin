import { GlideClient, GlideClusterClient } from "@valkey/valkey-glide"
import { closeClient, closeMetricsServer, connectToValkey } from "../connection.ts"
import { type Deps, withDeps } from "./utils.ts"
import { setClusterDashboardData } from "../set-dashboard-data.ts"
import { isLastConnectedClusterNode } from "../utils.ts"

export interface ConnectionDetails {
  host: string;
  port: string;
  username?: string;
  password?: string;
  tls: boolean;
  verifyTlsCertificate: boolean;
  //TODO: Add handling and UI for uploading cert
  caCertPath?: string;
}

type ConnectPayload = {
  connectionDetails: ConnectionDetails,
  connectionId: string
}

export const connectPending = withDeps<Deps, void>(
  async ({ ws, clients, action, clusterNodesMap }) => {
    await connectToValkey(ws, action.payload as ConnectPayload, clients, clusterNodesMap)
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
  async ({ ws, clients, action, metricsServerURIs, clusterNodesMap }) => {
    const { connectionId } = action.payload 
    const connection = clients.get(connectionId)
    const clusterId = connection?.clusterId
    const nodes = clusterNodesMap.get(clusterId!)
    
    closeMetricsServer(connectionId, metricsServerURIs)
    if (connection && await canSafelyDisconnect(connectionId, connection, clients, clusterNodesMap)){
      await closeClient(connectionId, connection.client, ws)
    }
    // Remove node from cluster map accordingly
    if (clusterId && nodes) {
      if (nodes.length === 1){
        clusterNodesMap.delete(clusterId)
      } 
      else  {
        const index = nodes!.indexOf(connectionId)
        if (index !== -1) {
          nodes!.splice(index, 1)
        }
      }
    }
    clients.delete(connectionId)
  },
)

const canSafelyDisconnect = async (
  connectionId: string,
  connection: { client: GlideClient | GlideClusterClient } | undefined,
  clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string }>,
  clusterNodesMap: Map<string, string[]>,
) => {
  if (connection?.client instanceof GlideClient) return true

  if (connection?.client instanceof GlideClusterClient)
    return isLastConnectedClusterNode(connectionId, clients, clusterNodesMap)

  return false
}
