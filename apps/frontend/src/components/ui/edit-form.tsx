import { type FormEvent, useState, useEffect, useCallback } from "react"
import { useSelector } from "react-redux"
import { sanitizeUrl } from "@common/src/url-utils.ts"
import { CONNECTED } from "@common/src/constants"
import { ConnectionModal } from "./connection-modal.tsx"
import {
  updateConnectionDetails,
  connectPending,
  deleteConnection,
  stopRetry,
  type ConnectionDetails
} from "@/state/valkey-features/connection/connectionSlice.ts"
import {
  selectConnectionDetails,
  selectConnections,
  selectIsAtConnectionLimit
} from "@/state/valkey-features/connection/connectionSelectors"
import { useAppDispatch } from "@/hooks/hooks"
import { secureStorage } from "@/utils/secureStorage.ts"

interface EditFormProps {
  onClose: () => void
  connectionId?: string
}

function EditForm({ onClose, connectionId }: EditFormProps) {
  const dispatch = useAppDispatch()
  const currentConnection = useSelector(selectConnectionDetails(connectionId || ""))
  const isAtConnectionLimit = useSelector(selectIsAtConnectionLimit)
  const allConnections = useSelector(selectConnections)
  const fullConnection = connectionId ? allConnections[connectionId] : null

  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails>({
    host: "localhost",
    port: "6379",
    username: "",
    password: "",
    tls: true,
    verifyTlsCertificate: true,
    alias: "",
    endpointType: "node" as const,
    authType: "password",
  })
  const [passwordChanged, setPasswordChanged] = useState(false)

  useEffect(() => {
    if (currentConnection) {
      setConnectionDetails({
        host: currentConnection.host,
        port: currentConnection.port,
        username: currentConnection.username ?? "",
        password: currentConnection.password ?? "",
        alias: currentConnection.alias ?? "",
        tls: currentConnection.tls ?? true,
        verifyTlsCertificate: currentConnection.verifyTlsCertificate ?? false,
        //TODO: Add handling and UI for uploading cert
        caCertPath: currentConnection.caCertPath ?? "",
        endpointType: currentConnection.endpointType ?? "node",
        authType: currentConnection.authType ?? "password",
        awsRegion: currentConnection.awsRegion ?? "",
        awsReplicationGroupId: currentConnection.awsReplicationGroupId ?? "",
      })
      setPasswordChanged(false)
    }
  }, [currentConnection])

  const handleConnectionDetailsChange = useCallback(
    (updated: ConnectionDetails) => {
      setConnectionDetails((prev) => {
        if (updated.password !== prev.password) {
          setPasswordChanged(true)
        }
        return updated
      })
    },
    [],
  )

  const hasCoreChanges = () => {
    if (!currentConnection) return false
    return (
      connectionDetails.host !== currentConnection.host ||
      connectionDetails.port !== currentConnection.port ||
      connectionDetails.username !== (currentConnection.username ?? "") ||
      connectionDetails.tls !== (currentConnection.tls ?? false) ||
      connectionDetails.verifyTlsCertificate !== (currentConnection.verifyTlsCertificate ?? false) ||
      connectionDetails.caCertPath !== (currentConnection.caCertPath ?? "") ||
      connectionDetails.authType !== (currentConnection.authType ?? "password") ||
      connectionDetails.awsRegion !== (currentConnection.awsRegion ?? "") ||
      connectionDetails.awsReplicationGroupId !== (currentConnection.awsReplicationGroupId ?? "") ||
      passwordChanged
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!connectionId || !currentConnection) return

    if (hasCoreChanges()) {
      const newConnectionId = sanitizeUrl(`${connectionDetails.host}-${connectionDetails.port}`)

      // Stop any ongoing retries for the current connection
      dispatch(stopRetry({ connectionId }))

      // Preserve connection history before deleting
      const connectionHistory = fullConnection?.connectionHistory || []

      // Always delete the old connection when making core changes
      dispatch(deleteConnection({ connectionId, silent: true }))

      // Encrypt password only if user typed a new one; otherwise it's already encrypted from Redux
      const detailsToDispatch = passwordChanged && connectionDetails.password
        ? { ...connectionDetails, password: await secureStorage.encryptIfAvailable(connectionDetails.password) }
        : connectionDetails

      dispatch(
        connectPending({
          connectionId: newConnectionId,
          connectionDetails: detailsToDispatch,
          isEdit: true,
          preservedHistory: connectionHistory,
        }),
      )
    } else {
      dispatch(
        updateConnectionDetails({
          connectionId,
          ...connectionDetails,
        }),
      )
    }

    onClose()
  }

  const shouldShowConnectionLimitWarning =
    isAtConnectionLimit && fullConnection?.status !== CONNECTED

  return (
    <ConnectionModal
      connectionDetails={connectionDetails}
      description="Modify your server's connection details."
      isSubmitDisabled={
        !connectionDetails.host ||
        !connectionDetails.port ||
        shouldShowConnectionLimitWarning
      }
      onClose={onClose}
      onConnectionDetailsChange={handleConnectionDetailsChange}
      onSubmit={handleSubmit}
      open
      showConnectionLimitWarning={shouldShowConnectionLimitWarning}
      showVerifyTlsCertificate={true}
      submitButtonText="Apply Changes"
      title="Edit Connection"
    />
  )
}

export default EditForm
