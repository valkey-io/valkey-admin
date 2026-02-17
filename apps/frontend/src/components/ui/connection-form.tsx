import { type FormEvent, useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { sanitizeUrl } from "@common/src/url-utils.ts"
import { CONNECTED, CONNECTING, ERROR } from "@common/src/constants.ts"
import { ConnectionModal } from "./connection-modal.tsx"
import { useAppDispatch, useAppSelector } from "@/hooks/hooks"
import { connectPending, type ConnectionDetails } from "@/state/valkey-features/connection/connectionSlice.ts"
import { selectIsAtConnectionLimit } from "@/state/valkey-features/connection/connectionSelectors"

interface ConnectionFormProps {
  onClose: () => void
}

function ConnectionForm({ onClose }: ConnectionFormProps) {
  const dispatch = useAppDispatch()
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails>({
    host: "localhost",
    port: "6379",
    username: "",
    password: "",
    tls: false,
    verifyTlsCertificate: false,
    alias: "",
  })
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const isAtConnectionLimit = useSelector(selectIsAtConnectionLimit)
  const connectionState = useAppSelector((state) =>
    connectionId ? state.valkeyConnection.connections[connectionId] : null,
  )

  const isConnecting = connectionState?.status === CONNECTING
  const hasError = connectionState?.status === ERROR
  const errorMessage = connectionState?.errorMessage

  // close connection form on successful connection
  useEffect(() => {
    if (connectionState?.status === CONNECTED) {
      onClose()
    }
  }, [connectionState?.status, onClose])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (isAtConnectionLimit) return
    const newConnectionId = sanitizeUrl(`${connectionDetails.host}-${connectionDetails.port}`)
    setConnectionId(newConnectionId)
    dispatch(connectPending({ connectionId: newConnectionId, connectionDetails }))
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
