import { type FormEvent, useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { buildConnectionId } from "@common/src/connection-id.ts"
import { CONNECTED, CONNECTING, ERROR } from "@common/src/constants.ts"
import { ConnectionModal } from "./connection-modal.tsx"
import { useAppDispatch, useAppSelector } from "@/hooks/hooks"
import { connectPending, type ConnectionDetails } from "@/state/valkey-features/connection/connectionSlice.ts"
import { selectIsAtConnectionLimit } from "@/state/valkey-features/connection/connectionSelectors"
import {
  discoveryEndpointPending,
  clearEndpointDiscovery
} from "@/state/valkey-features/topology/topologySlice.ts"
import { secureStorage } from "@/utils/secureStorage.ts"

interface ConnectionFormProps {
  onClose: () => void
}

const isValidDb = (db: unknown): db is number =>
  typeof db === "number" && Number.isInteger(db) && db >= 0 && db <= 15

function ConnectionForm({ onClose }: ConnectionFormProps) {
  const dispatch = useAppDispatch()
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails>({
    host: "",
    port: "6379",
    username: "",
    password: "",
    tls: true,
    verifyTlsCertificate: true,
    alias: "",
    endpointType: "node" as const,
    authType: "password",
    db: 0,
  })
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [discoveryId, setDiscoveryId] = useState<string | null>(null)
  const [dbError, setDbError] = useState<string | undefined>(undefined)
  const isAtConnectionLimit = useSelector(selectIsAtConnectionLimit)
  const discoveryState = useAppSelector((state) =>
    discoveryId ? state.valkeyTopology.discoveries[discoveryId] : null,
  )

  // for discovery endpoint - the first node's connectionId resolved from discovery
  const nodeConnectionId = connectionId ?? discoveryState?.nodeConnectionId ?? null

  const connectionState = useAppSelector((state) =>
    nodeConnectionId ? state.valkeyConnection.connections[nodeConnectionId] : null,
  )

  const isDiscovering = discoveryState?.status === "pending" || discoveryState?.status === "node_connecting"
  const isConnecting = isDiscovering || connectionState?.status === CONNECTING
  const hasError = discoveryState?.status === "rejected" || connectionState?.status === ERROR
  const errorMessage = discoveryState?.errorMessage ?? connectionState?.errorMessage

  // close connection form on successful connection
  useEffect(() => {
    if (connectionState?.status === CONNECTED) {
      onClose()
    }
  }, [connectionState?.status, onClose])

  // cleanup discovery state when unmounting
  useEffect(() => () => {
    if (discoveryId) dispatch(clearEndpointDiscovery({ discoveryId }))
  }, [discoveryId, dispatch])

  // Coerce db to 0 whenever the form uses cluster-endpoint mode.
  const handleConnectionDetailsChange = (next: ConnectionDetails) =>
    setConnectionDetails(
      next.endpointType === "cluster-endpoint" && next.db !== 0
        ? { ...next, db: 0 }
        : next,
    )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (isAtConnectionLimit) return

    if (!isValidDb(connectionDetails.db)) {
      setDbError("Database must be an integer between 0 and 15.")
      return
    }
    setDbError(undefined)

    const trimmed: ConnectionDetails = {
      ...connectionDetails,
      host: connectionDetails.host.trim(),
      // uses typed alias which falls back to awsReplicationGroupId for AWS IAM auth
      alias: connectionDetails.alias?.trim() || (connectionDetails.authType === "iam" ? connectionDetails.awsReplicationGroupId : ""),
      username: connectionDetails.username?.trim() ?? "",
      awsRegion: connectionDetails.awsRegion?.trim(),
      awsReplicationGroupId: connectionDetails.awsReplicationGroupId?.trim(),
    }

    const detailsToDispatch = connectionDetails.password
      ? { ...trimmed, password: await secureStorage.encryptIfAvailable(connectionDetails.password) }
      : trimmed

    if (trimmed.endpointType === "cluster-endpoint") {
      const newDiscoveryId = `discovery-${buildConnectionId(trimmed.host, trimmed.port, 0)}`
      setDiscoveryId(newDiscoveryId)
      setConnectionId(null)
      dispatch(discoveryEndpointPending({ discoveryId: newDiscoveryId, connectionDetails: detailsToDispatch }))
      return
    }

    const newConnectionId = buildConnectionId(trimmed.host, trimmed.port, trimmed.db)
    setConnectionId(newConnectionId)
    setDiscoveryId(null)
    dispatch(connectPending({ connectionId: newConnectionId, connectionDetails: detailsToDispatch }))
  }

  return (
    <ConnectionModal
      connectionDetails={connectionDetails}
      dbError={dbError}
      description="Enter your server's host and port to connect."
      errorMessage={hasError && errorMessage ? errorMessage : undefined}
      isConnecting={isConnecting}
      isSubmitDisabled={
        !connectionDetails.host || !connectionDetails.port || isConnecting || isAtConnectionLimit
      }
      onClose={onClose}
      onConnectionDetailsChange={handleConnectionDetailsChange}
      onSubmit={handleSubmit}
      open
      showConnectionLimitWarning={isAtConnectionLimit}
      submitButtonText={isConnecting ? "Connecting..." : "Connect"}
      title="Add Connection"
    />
  )
}

export default ConnectionForm
