import { X } from "lucide-react"
import { type FormEvent, useState, useEffect } from "react"
import { useSelector } from "react-redux"
import {
  updateConnectionDetails,
  connectPending,
  deleteConnection,
  stopRetry
} from "@/state/valkey-features/connection/connectionSlice.ts"
import { selectConnectionDetails } from "@/state/valkey-features/connection/connectionSelectors"
import { useAppDispatch } from "@/hooks/hooks"
import { sanitizeUrl } from "@common/src/url-utils.ts"

type EditFormProps = {
  onClose: () => void;
  connectionId?: string;
};

function EditForm({ onClose, connectionId }: EditFormProps) {
  const dispatch = useAppDispatch()
  const currentConnection = useSelector(selectConnectionDetails(connectionId || ""))

  const [host, setHost] = useState("localhost")
  const [port, setPort] = useState("6379")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [alias, setAlias] = useState("")

  useEffect(() => {
    if (currentConnection) {
      setHost(currentConnection.host)
      setPort(currentConnection.port)
      setUsername(currentConnection.username || "")
      setPassword("")
      setAlias(currentConnection.alias || "")
    }
  }, [currentConnection])

  const hasCoreChanges = () => {
    if (!currentConnection) return false
    return (
      host !== currentConnection.host ||
      port !== currentConnection.port ||
      username !== (currentConnection.username || "") ||
      password !== ""
    )
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()

    if (!connectionId || !currentConnection) return

    if (hasCoreChanges()) {
      const newConnectionId = sanitizeUrl(`${host}-${port}`)

      // Stop any ongoing retries for the current connection
      dispatch(stopRetry({ connectionId }))

      // Always delete the old connection when making core changes
      dispatch(deleteConnection({ connectionId, silent: true }))

      dispatch(connectPending({
        connectionId: newConnectionId,
        host,
        port,
        username,
        password,
        alias,
        isEdit: true,
      }))
    } else {
      dispatch(updateConnectionDetails({
        connectionId,
        alias: alias || undefined,
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
              onChange={(e) => setHost(e.target.value)}
              placeholder="localhost"
              required
              type="text"
              value={host}
              autoFocus
            />
          </div>
          <div>
            <label className="block mb-1 text-sm">Port</label>
            <input
              className="w-full px-3 py-2 border rounded dark:border-tw-dark-border"
              onChange={(e) => setPort(e.target.value)}
              placeholder="6379"
              required
              type="number"
              value={port}
            />
          </div>
          <div>
            <label className="block mb-1 text-sm">Alias</label>
            <input
              className="w-full px-3 py-2 border rounded dark:border-tw-dark-border placeholder:text-xs"
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Alias of the first cluster node will be the alias of the cluster"
              type="text"
              value={alias}
            />
          </div>
          <div>
            <label className="block mb-1 text-sm">Username</label>
            <input
              className="w-full px-3 py-2 border rounded dark:border-tw-dark-border"
              onChange={(e) => setUsername(e.target.value)}
              type="text"
              value={username}
            />
          </div>
          <div>
            <label className="block mb-1 text-sm">Password</label>
            <input
              className="w-full px-3 py-2 border rounded dark:border-tw-dark-border"
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              value={password}
            />
          </div>
          <div className="pt-2 text-sm">
            <button
              className="px-4 py-2 w-full bg-tw-primary text-white rounded hover:bg-tw-primary/90"
              disabled={!host || !port}
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
