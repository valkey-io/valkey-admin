import { Loader2, X } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"

type ConnectionFormProps = {
  onClose: () => void;
};

import { sanitizeUrl } from "@common/src/url-utils.ts"
import { CONNECTED, CONNECTING, ERROR } from "@common/src/constants.ts"
import { useAppDispatch, useAppSelector } from "@/hooks/hooks"
import { connectPending } from "@/state/valkey-features/connection/connectionSlice.ts"

function ConnectionForm({ onClose }: ConnectionFormProps) {
  const dispatch = useAppDispatch()
  const [host, setHost] = useState("localhost")
  const [port, setPort] = useState("6379")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [alias, setAlias] = useState("")
  const [connectionId, setConnectionId] = useState<string | null>(null)

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
    const newConnectionId = sanitizeUrl(`${host}-${port}`)
    setConnectionId(newConnectionId)
    dispatch(
      connectPending({ host, port, username, password, alias, connectionId: newConnectionId }),
    )
  }

  return (
    <Dialog.Root onOpenChange={onClose} open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-black/50" />
        <Dialog.Content asChild>
          <div className="fixed inset-0 z-40 flex items-center justify-center">
            <div className="w-full max-w-md p-6 bg-white dark:bg-tw-dark-primary dark:border-tw-dark-border rounded-lg shadow-lg border">
              <div className="flex justify-between">
                <Dialog.Title className="text-lg font-semibold">Add Connection</Dialog.Title>
                <Dialog.Close asChild>
                  <button className="hover:text-tw-primary">
                    <X size={20} />
                  </button>
                </Dialog.Close>
              </div>
              <Dialog.Description className="text-sm font-light">
                Enter your server's host and port to connect.
              </Dialog.Description>
              {hasError && errorMessage && (
                <div className="mt-4 p-1 text-sm bg-tw-primary/20 text-red-500 border rounded">
                  {errorMessage}
                </div>
              )}
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
                    className="px-4 py-2 w-full bg-tw-primary text-white rounded hover:bg-tw-primary/90 disabled:opacity-50 
                    disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    disabled={!host || !port || isConnecting}
                    type="submit"
                  >
                    {isConnecting && <Loader2 className="animate-spin" size={16} />}
                    {isConnecting ? "Connecting..." : "Connect"}
                  </button>
                </div>
              </form>
            </div>
          </div></Dialog.Content></Dialog.Portal></Dialog.Root>
  )
}

export default ConnectionForm
