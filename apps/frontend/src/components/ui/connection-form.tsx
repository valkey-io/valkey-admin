import { type FormEvent, useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { sanitizeUrl } from "@common/src/url-utils.ts"
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
  })
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [discoveryId, setDiscoveryId] = useState<string | null>(null)
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (isAtConnectionLimit) return

    const trimmed: ConnectionDetails = {
      ...connectionDetails,
      host: connectionDetails.host.trim(),
      alias: connectionDetails.alias?.trim() ?? "",
      username: connectionDetails.username?.trim() ?? "",
      awsRegion: connectionDetails.awsRegion?.trim(),
      awsReplicationGroupId: connectionDetails.awsReplicationGroupId?.trim(),
    }

    const detailsToDispatch = connectionDetails.password
      ? { ...trimmed, password: await secureStorage.encryptIfAvailable(connectionDetails.password) }
      : trimmed

    if (trimmed.endpointType === "cluster-endpoint") {
      const newDiscoveryId = `discovery-${sanitizeUrl(`${trimmed.host}-${trimmed.port}`)}`
      setDiscoveryId(newDiscoveryId)
      setConnectionId(null)
      dispatch(discoveryEndpointPending({ discoveryId: newDiscoveryId, connectionDetails: detailsToDispatch }))
      return
    }

    const newConnectionId = sanitizeUrl(`${trimmed.host}-${trimmed.port}`)
    setConnectionId(newConnectionId)
    setDiscoveryId(null)
    dispatch(connectPending({ connectionId: newConnectionId, connectionDetails: detailsToDispatch }))
  }

  return (
    <ConnectionModal
      connectionDetails={connectionDetails}
      description="Enter your server's host and port to connect."
      errorMessage={hasError && errorMessage ? errorMessage : undefined}
      isConnecting={isConnecting}
      isSubmitDisabled={
        !connectionDetails.host || !connectionDetails.port || isConnecting || isAtConnectionLimit
      }
      onClose={onClose}
      onConnectionDetailsChange={setConnectionDetails}
      onSubmit={handleSubmit}
      open
      showConnectionLimitWarning={isAtConnectionLimit}
      submitButtonText={isConnecting ? "Connecting..." : "Connect"}
      title="Add Connection"
    />
  )
}

export default ConnectionForm
