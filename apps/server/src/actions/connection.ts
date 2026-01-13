import { GlideClusterClient } from "@valkey/valkey-glide"
import { connectToValkey } from "../connection.ts"
import { type Deps, withDeps } from "./utils.ts"
import { setClusterDashboardData } from "../set-dashboard-data.ts"

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
      await setClusterDashboardData(clusterId, client, ws)
    }
  },
)
