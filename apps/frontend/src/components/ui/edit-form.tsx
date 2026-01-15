import { X } from "lucide-react"
import { type FormEvent, useState, useEffect } from "react"
import { useSelector } from "react-redux"
import { sanitizeUrl } from "@common/src/url-utils.ts"
import {
  updateConnectionDetails,
  connectPending,
  deleteConnection,
  stopRetry,
  type ConnectionDetails
} from "@/state/valkey-features/connection/connectionSlice.ts"
import { selectConnectionDetails, selectConnections } from "@/state/valkey-features/connection/connectionSelectors"
import { useAppDispatch } from "@/hooks/hooks"

type EditFormProps = {
  onClose: () => void;
  connectionId?: string;
};

function EditForm({ onClose, connectionId }: EditFormProps) {
  const dispatch = useAppDispatch()
  const currentConnection = useSelector(selectConnectionDetails(connectionId || ""))
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
    return (
      connectionDetails !== currentConnection 
    )
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

      dispatch(connectPending({
        connectionId: newConnectionId,
        connectionDetails,
        isEdit: true,
        preservedHistory: connectionHistory,
      }))
    } else {
      dispatch(updateConnectionDetails({
        connectionId,
        alias: connectionDetails.alias || undefined,
      }))
    }

    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="w-full max-w-md p-6 bg-white dark:bg-tw-dark-primary dark:border-tw-dark-border rounded-lg shadow-lg border">
        <div className="flex justify-between">
          <h2 className="text-lg font-semibold">Edit Connection</h2>
          <button className="hover:text-tw-primary" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <span className="text-sm font-light">
          Modify your server's connection details.
        </span>
        <form className="space-y-4 mt-4" onSubmit={handleSubmit}>
          <div>
            <label className="block mb-1 text-sm">Host</label>
            <input
              className="w-full px-3 py-2 border rounded dark:border-tw-dark-border"
              onChange={(e) => setConnectionDetails((prev) => ({ ...prev, host: e.target.value }))}
              placeholder="localhost"
              required
              type="text"
              value={connectionDetails.host}
            />
          </div>
          <div>
            <label className="block mb-1 text-sm">Port</label>
            <input
              className="w-full px-3 py-2 border rounded dark:border-tw-dark-border"
              onChange={(e) => setConnectionDetails((prev) => ({ ...prev, port: e.target.value }))}
              placeholder="6379"
              required
              type="number"
              value={connectionDetails.port}
            />
          </div>
          <div>
            <label className="block mb-1 text-sm">Alias</label>
            <input
              className="w-full px-3 py-2 border rounded dark:border-tw-dark-border placeholder:text-xs"
              onChange={(e) => setConnectionDetails((prev) => ({ ...prev, alias: e.target.value }))}
              placeholder="Alias of the first cluster node will be the alias of the cluster"
              type="text"
              value={connectionDetails.alias}
            />
          </div>
          <div>
            <label className="block mb-1 text-sm">Username</label>
            <input
              className="w-full px-3 py-2 border rounded dark:border-tw-dark-border"
              onChange={(e) => setConnectionDetails((prev) => ({ ...prev, username: e.target.value }))}
              type="text"
              value={connectionDetails.username}
            />
          </div>

          <div>
            <label className="block mb-1 text-sm">Password</label>
            <input
              className="w-full px-3 py-2 border rounded dark:border-tw-dark-border"
              onChange={(e) => setConnectionDetails((prev) => ({ ...prev, password: e.target.value }))}
              type="password"
              value={connectionDetails.password}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              checked={connectionDetails.tls}
              className="h-4 w-4"
              id="tls"
              onChange={(e) => setConnectionDetails((prev) => ({ ...prev, tls: e.target.checked }))}
              type="checkbox"
            />
            <label className="text-sm select-none" htmlFor="tls">
              TLS
            </label>
          </div>

          <div className="pt-2 text-sm">
            <button
              className="px-4 py-2 w-full bg-tw-primary text-white rounded hover:bg-tw-primary/90"
              disabled={!connectionDetails.host || !connectionDetails.port}
              type="submit"
            >
              Apply Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditForm
