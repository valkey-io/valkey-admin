import { GlideClusterClient } from "@valkey/valkey-glide"
import { EndpointType, buildConnectionId, normalizeEndpoint } from "valkey-common"
import { VALKEY } from "valkey-common"
import { connectToValkey, proveCredentials, teardownConnection, type ProbedTopology } from "../connection"
import { unsubscribe, getWatcherCount, scopedId } from "../node-watchers"
import { bindConnection, connectedNodesFor, scheduleRelease, unbindConnection } from "../socket-binding"
import { findOwnerState, getOwnerState, identityOf, ownerStatesWithIdentity, removeOwnerStateIfUnused } from "../owner"
import { findClusterOwner } from "../cluster-owner"
import { type Deps, withDeps } from "./utils"
import { setClusterDashboardData } from "../set-dashboard-data"

export interface ConnectionDetails {
  host: string;
  port: string;
  username?: string;
  password?: string;
  tls: boolean;
  verifyTlsCertificate: boolean;
  /**
   * @deprecated Ignored by the server, which always uses `VALKEY_CA_CERT_PATH`.
   * A client must not pick a file on the server's disk as a trust root. A future
   * CA upload feature needs a new field that carries PEM content, not a path.
   */
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

export const CONNECTION_ID_MISMATCH_MESSAGE =
  "Connection id does not match the host and port. Edit the connection and connect again."

/**
 * The owner for a connection that just passed AUTH against `endpoint`.
 *
 * Standalone: this identity on this endpoint. Cluster: the owner of the same
 * identity whose registry lists this node and whose seed the node's topology
 * lists back (`findClusterOwner`); otherwise a new owner seeded here. A second
 * owner for one cluster is allowed (it costs a second set of collectors) and
 * is logged, because it can also mean a node that reports a false clusterId.
 */
const pickOwnerState = (details: ConnectionDetails, endpoint: ReturnType<typeof normalizeEndpoint>, probed: ProbedTopology) => {
  if (probed.cluster) {
    const identity = identityOf(details)
    const candidates = ownerStatesWithIdentity(identity)
    const joined = findClusterOwner(probed.clusterId, endpoint, probed.discoveredClusterNodes, candidates)
    if (joined) return joined
    const others = candidates.filter((state) => state.clusterNodesRegistry.has(probed.clusterId))
    if (others.length > 0) {
      console.warn(
        `Cluster ${probed.clusterId}: ${endpoint.host}:${endpoint.port} did not join ${others.map((o) => o.ownerKey).join(", ")} `
          + "(the node is not in that owner's topology, or that owner's seed is not in this node's topology). "
          + "Creating a separate owner for it.",
      )
    }
  }
  return getOwnerState(details, endpoint)
}

export const connectPending = withDeps<Deps, void>(
  async ({ ws, action, binding }) => {
    const payload = action.payload as ConnectPayload
    const { connectionId, connectionDetails } = payload
    const reject = (errorMessage: string, extra: Record<string, unknown> = {}) =>
      ws.send(JSON.stringify({
        type: VALKEY.CONNECTION.connectRejected,
        payload: { connectionId, errorMessage, ...extra },
      }))

    // A resume without a password cannot prove the identity, and no server-side
    // session remembers it, so the user must enter the password again.
    if (payload.isResume && isPasswordAuth(connectionDetails) && !connectionDetails.password) {
      reject("Enter the password to reconnect.", { requiresAuth: true })
      return
    }

    // The id must name the endpoint the credentials are proven against. The
    // frontend builds it from the same normalized values.
    let endpoint: ReturnType<typeof normalizeEndpoint>
    try {
      endpoint = normalizeEndpoint(connectionDetails.host, connectionDetails.port)
    } catch (err) {
      reject(err instanceof Error ? err.message : String(err))
      return
    }
    if (connectionId !== buildConnectionId(endpoint.host, endpoint.port, connectionDetails.db)) {
      reject(CONNECTION_ID_MISMATCH_MESSAGE)
      return
    }

    // Prove the credentials before anything is created for the owner, so a
    // request that Valkey rejects leaves no owner state behind. The probe also
    // tells us whether this is a cluster node and what topology it reports.
    let probed: ProbedTopology
    try {
      probed = await proveCredentials(connectionDetails, endpoint)
    } catch (err) {
      reject(err instanceof Error ? err.message : String(err))
      return
    }

    const ownerState = pickOwnerState(connectionDetails, endpoint, probed)
    const { ownerKey } = ownerState
    const client = await connectToValkey(
      { ...ownerState, connectedNodesByCluster: connectedNodesFor(binding, ownerKey) },
      ws,
      payload,
      { probed, endpoint },
    )
    if (!client) {
      // The connect failed after AUTH (for example a bad database index).
      removeOwnerStateIfUnused(ownerState)
      return
    }

    // Case if the socket closed while the connect ran.
    if (ws.readyState !== ws.OPEN) {
      unsubscribe(scopedId(ownerKey, connectionId), ws)
      scheduleRelease(ownerState, connectionId)
      return
    }

    // Valkey accepted the credentials: the socket may now act on this connection.
    const previousOwner = bindConnection(binding, ownerKey, connectionId)
    if (previousOwner !== undefined) {
      // The socket reconnected the same connectionId as another Valkey user.
      // Release the old owner's watch so its client can be torn down.
      const previousState = findOwnerState(previousOwner)
      if (unsubscribe(scopedId(previousOwner, connectionId), ws) && previousState) {
        scheduleRelease(previousState, connectionId)
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

    if (ownerState && client instanceof GlideClusterClient) {
      await setClusterDashboardData(clusterId, client, ws, connectionId, ownerState)
    }
  },
)

export const closeConnection = withDeps<Deps, void>(
  async ({ ws, clients, action, connectedNodesByCluster, ownerKey, ownerState, binding }) => {
    // Resolved against a bound connection, so the owner is known.
    if (ownerKey === undefined) return
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

    if (ownerState) teardownConnection(ownerState, connectionId)
  },
)
