import { X } from "lucide-react"
import { type FormEvent, useState } from "react"

type ConnectionFormProps = {
  onClose: () => void;
};

import { sanitizeUrl } from "@common/src/url-utils.ts"
import { useAppDispatch } from "@/hooks/hooks"
import { connectPending } from "@/state/valkey-features/connection/connectionSlice.ts"

function ConnectionForm({ onClose }: ConnectionFormProps) {
  const dispatch = useAppDispatch()
  const [host, setHost] = useState("localhost")
  const [port, setPort] = useState("6379")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [alias, setAlias] = useState("")

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const connectionId = sanitizeUrl(`${host}-${port}`)
    dispatch(
      connectPending({ host, port, username, password, alias, connectionId }),
    )
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="w-full max-w-md p-6 bg-white dark:bg-tw-dark-primary dark:border-tw-dark-border rounded-lg shadow-lg border">
        <div className="flex justify-between">
          <h2 className="text-lg font-semibold">Add Connection</h2>
          <button className="hover:text-tw-primary" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <span className="text-sm font-light">
          Enter your server's host and port to connect.
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
              Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ConnectionForm
