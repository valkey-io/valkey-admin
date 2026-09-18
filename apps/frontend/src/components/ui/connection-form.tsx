import { type FormEvent, useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { buildConnectionId, isValidDatabaseIndex } from "@common/src/connection-id.ts"
import { CONNECTED, CONNECTING, ERROR } from "@common/src/constants.ts"
import { toast } from "sonner"
import { ConnectionModal } from "./connection-modal.tsx"
import { useAppDispatch, useAppSelector } from "@/hooks/hooks"
import { connectPending, type ConnectionDetails } from "@/state/valkey-features/connection/connectionSlice.ts"
import { selectIsAtConnectionLimit } from "@/state/valkey-features/connection/connectionSelectors"
import {
  discoveryEndpointPending,
  clearEndpointDiscovery
} from "@/state/valkey-features/topology/topologySlice.ts"
import { secureStorage, PASSWORD_NOT_STORED_WARNING } from "@/utils/secureStorage.ts"

interface ConnectionFormProps {
  onClose: () => void
}

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

  const handleConnectionDetailsChange = (next: ConnectionDetails) =>
    setConnectionDetails(next)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (isAtConnectionLimit) return

    // No static upper bound: the valid range depends on the server's
    // `databases` config, which the backend checks at connect time.
    if (!isValidDatabaseIndex(connectionDetails.db)) {
      setDbError("Database must be a non-negative integer.")
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

    let isPasswordEncrypted: boolean | undefined
    let detailsToDispatch = trimmed
    if (connectionDetails.password) {
      const result = await secureStorage.encryptForStorage(connectionDetails.password)
      isPasswordEncrypted = result.ok
      // On failure keep the plaintext so this session can connect; it will not be
      // persisted (see the persistence layer), and the user is warned.
      detailsToDispatch = { ...trimmed, password: result.ok ? result.value : connectionDetails.password }
      if (!result.ok) toast.warning(PASSWORD_NOT_STORED_WARNING)
    }

    if (trimmed.endpointType === "cluster-endpoint") {
      const newDiscoveryId = `discovery-${buildConnectionId(trimmed.host, trimmed.port, 0)}`
      setDiscoveryId(newDiscoveryId)
      setConnectionId(null)
      dispatch(discoveryEndpointPending({ discoveryId: newDiscoveryId, connectionDetails: detailsToDispatch, isPasswordEncrypted }))
      return
    }

    const newConnectionId = buildConnectionId(trimmed.host, trimmed.port, trimmed.db)
    setConnectionId(newConnectionId)
    setDiscoveryId(null)
    dispatch(connectPending({ connectionId: newConnectionId, connectionDetails: detailsToDispatch, isPasswordEncrypted }))
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
