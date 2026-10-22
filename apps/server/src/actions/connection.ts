import { GlideClusterClient } from "@valkey/valkey-glide"
import { EndpointType } from "valkey-common"
import { VALKEY } from "valkey-common"
import { connectToValkey, teardownConnection } from "../connection"
import { unsubscribe, getWatcherCount, scopedId } from "../node-watchers"
import { bindConnection, connectedNodesFor, scheduleRelease, unbindConnection } from "../socket-binding"
import { getOwnerState } from "../owner"
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
  authType?: "password" | "iam" | "gcp-iam";
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

const isPasswordAuth = (details: ConnectionDetails) =>
  details.authType !== "iam" && details.authType !== "gcp-iam"

export const connectPending = withDeps<Deps, void>(
  async ({ ws, action, ownerKey, ownerState, binding }) => {
    const payload = action.payload as ConnectPayload
    const { connectionId, connectionDetails } = payload

    // A resume without a password cannot prove the identity, and no server-side
    // session remembers it, so the user must enter the password again.
    if (payload.isResume && isPasswordAuth(connectionDetails) && !connectionDetails.password) {
      ws.send(JSON.stringify({
        type: VALKEY.CONNECTION.connectRejected,
        payload: { connectionId, errorMessage: "Enter the password to reconnect.", requiresAuth: true },
      }))
      return
    }

    const client = await connectToValkey(
      { ...ownerState, connectedNodesByCluster: connectedNodesFor(binding, ownerKey) },
      ws,
      payload,
    )
    if (!client) return

    // Valkey accepted the credentials: the socket may now act on this connection.
    const previousOwner = bindConnection(binding, ownerKey, connectionId)
    if (previousOwner !== undefined) {
      // The socket reconnected the same connectionId as another Valkey user.
      // Release the old owner's watch so its client can be torn down.
      if (unsubscribe(scopedId(previousOwner, connectionId), ws)) {
        scheduleRelease(getOwnerState(previousOwner), connectionId)
      }
    }
  },
)

export const resetConnection = withDeps<Deps, void>(
  async ({ ws, connectionId, clients, action, ownerState }) => {
    const entry = clients.get(connectionId)

    if (!entry) {
      throw new Error("Client not found")
    }

    const { client } = entry

    const { clusterId } = action.payload as unknown as { clusterId: string }

    if (client instanceof GlideClusterClient) {
      await setClusterDashboardData(clusterId, client, ws, connectionId, ownerState)
    }
  },
)

export const closeConnection = withDeps<Deps, void>(
  async ({ ws, clients, action, connectedNodesByCluster, ownerKey, ownerState, binding }) => {
    const { connectionId } = action.payload
    const connection = clients.get(connectionId)
    const clusterId = connection?.clusterId

    unbindConnection(binding, connectionId)
    unsubscribe(scopedId(ownerKey, connectionId), ws)

    // Always ack the requesting client — UI needs confirmation
    ws.send(JSON.stringify({
      type: VALKEY.CONNECTION.closeConnectionFulfilled,
      payload: { connectionId },
    }))

    const nodes = connectedNodesByCluster.get(clusterId!)
    // Remove node from this socket's cluster map accordingly
    if (clusterId && nodes) {
      const index = nodes.indexOf(connectionId)
      if (index !== -1) nodes.splice(index, 1)
      if (nodes.length === 0) connectedNodesByCluster.delete(clusterId)
    }

    // Don't tear down a connection another socket of the same owner still uses
    if (getWatcherCount(scopedId(ownerKey, connectionId)) > 0) return

    teardownConnection(ownerState, connectionId)
  },
)
