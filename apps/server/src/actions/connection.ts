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
  async ({ ws, clients, action }) => {
    await connectToValkey(ws, action.payload as ConnectPayload, clients)
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
  async ({ ws, clients, action, metricsServerURIs }) => {
    const { connectionId } = action.payload 
    const connection = clients.get(connectionId)
    closeMetricsServer(connectionId, metricsServerURIs)
    if (connection && await canSafelyDisconnect(connectionId, connection, clients)){
      await closeClient(connectionId, connection.client, ws)
    }
    clients.delete(connectionId)
  },
)

const canSafelyDisconnect = async (
  connectionId: string,
  connection: { client: GlideClient | GlideClusterClient } | undefined,
  clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string }>,
) => {
  if (connection?.client instanceof GlideClient) return true

  if (connection?.client instanceof GlideClusterClient)
    return isLastConnectedClusterNode(connectionId, clients)

  return false
}
