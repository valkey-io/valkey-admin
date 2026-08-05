import { type FormEvent, useState, useEffect, useCallback } from "react"
import { useSelector } from "react-redux"
import { buildConnectionId, isValidDatabaseIndex } from "@common/src/connection-id.ts"
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
    db: 0,
  })
  const [passwordChanged, setPasswordChanged] = useState(false)
  const [dbError, setDbError] = useState<string | undefined>(undefined)

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
        db: currentConnection.db,
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
      connectionDetails.db !== currentConnection.db ||
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

  // The learned count belongs to the connection's current host/port. It stays
  // undefined when the server's count was unreadable, in that case there is no
  // known range, so no hint and no client-side bound.
  const isSameServer =
    connectionDetails.host.trim() === currentConnection?.host &&
    connectionDetails.port === currentConnection?.port
  const databasesCount = isSameServer ? currentConnection?.databasesCount : undefined

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!connectionId || !currentConnection) return

    if (!isValidDatabaseIndex(connectionDetails.db)) {
      setDbError("Database must be a non-negative integer.")
      return
    }

    const trimmed: ConnectionDetails = {
      ...connectionDetails,
      host: connectionDetails.host.trim(),
      alias: connectionDetails.alias?.trim() ?? "",
      username: connectionDetails.username?.trim() ?? "",
      awsRegion: connectionDetails.awsRegion?.trim(),
      awsReplicationGroupId: connectionDetails.awsReplicationGroupId?.trim(),
    }

    // `databasesCount` is already scoped to an unchanged host/port, so a known
    // value here always bounds the requested db.
    if (databasesCount !== undefined && trimmed.db >= databasesCount) {
      setDbError(
        `This server has databases = ${databasesCount}; choose a database in 0..${databasesCount - 1}.`,
      )
      return
    }
    setDbError(undefined)

    if (hasCoreChanges()) {
      const newConnectionId = buildConnectionId(trimmed.host, trimmed.port, trimmed.db)

      // Stop any ongoing retries for the current connection
      dispatch(stopRetry({ connectionId }))

      // Preserve connection history before deleting
      const connectionHistory = fullConnection?.connectionHistory || []

      // Always delete the old connection when making core changes
      dispatch(deleteConnection({ connectionId, silent: true }))

      // Encrypt password only if user typed a new one; otherwise it's already encrypted from Redux
      const detailsToDispatch = passwordChanged && connectionDetails.password
        ? { ...trimmed, password: await secureStorage.encryptIfAvailable(connectionDetails.password) }
        : trimmed

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
          ...trimmed,
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
      dbError={dbError}
      dbHint={
        databasesCount !== undefined
          ? `Valid range on this server: 0..${databasesCount - 1}`
          : undefined
      }
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
