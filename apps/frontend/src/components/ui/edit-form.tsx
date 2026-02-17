import { type FormEvent, useState, useEffect } from "react"
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
    tls: false,
    verifyTlsCertificate: false,
    alias: "",
  })

  useEffect(() => {
    if (currentConnection) {
      setConnectionDetails({
        host: currentConnection.host,
        port: currentConnection.port,
        username: currentConnection.username ?? "",
        password: "",
        alias: currentConnection.alias ?? "",
        tls: currentConnection.tls ?? false,
        verifyTlsCertificate: currentConnection.verifyTlsCertificate ?? false,
        //TODO: Add handling and UI for uploading cert
        caCertPath: currentConnection.caCertPath ?? "",
      })
    }
  }, [currentConnection])

  const hasCoreChanges = () => {
    if (!currentConnection) return false
    return connectionDetails !== currentConnection
  }

  const handleSubmit = (e: FormEvent) => {
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

      dispatch(
        connectPending({
          connectionId: newConnectionId,
          connectionDetails,
          isEdit: true,
          preservedHistory: connectionHistory,
        }),
      )
    } else {
      dispatch(
        updateConnectionDetails({
          connectionId,
          alias: connectionDetails.alias || undefined,
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
      onConnectionDetailsChange={setConnectionDetails}
      onSubmit={handleSubmit}
      open
      showConnectionLimitWarning={shouldShowConnectionLimitWarning}
      showVerifyTlsCertificate={false}
      submitButtonText="Apply Changes"
      title="Edit Connection"
    />
  )
}

export default EditForm
