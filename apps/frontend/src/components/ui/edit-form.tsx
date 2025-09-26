import { X } from "lucide-react"

type EditFormProps = {
  onClose: () => void;
};

import { useState, useEffect } from "react"
import { useSelector } from "react-redux"
import {
  updateConnectionDetails,
  connectPending
} from "@/state/valkey-features/connection/connectionSlice.ts"
// import { resetConnection } from "@/state/valkey-features/connection/connectionSlice.ts";
import { selectConnectionDetails } from "@/state/valkey-features/connection/connectionSelectors"
import { useAppDispatch } from "@/hooks/hooks"

function EditForm({ onClose }: EditFormProps) {
  const dispatch = useAppDispatch()
  const currentConnection = useSelector(selectConnectionDetails)
  const [host, setHost] = useState("localhost")
  const [port, setPort] = useState("6379")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")

  // Load existing connection data when component mounts
  useEffect(() => {
    if (currentConnection) {
      setHost(currentConnection.host)
      setPort(currentConnection.port)
      setUsername(currentConnection.username || "")
      setPassword(currentConnection.password || "")
    }
  }, [currentConnection])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Update stored connection
    dispatch(
      updateConnectionDetails({
        host,
        port,
        username,
        password,
      })
    )

    // Disconnect First
    // dispatch(resetConnection());

    // Then Reconnect
    setTimeout(() => {
      dispatch(
        connectPending({
          host,
          port,
          username,
          password,
        })
      )
    }, 100)

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
