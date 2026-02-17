import { Loader2, X } from "lucide-react"
import { type FormEvent } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { MAX_CONNECTIONS } from "@common/src/constants.ts"
import { Button } from "./button.tsx"
import { Input } from "./input.tsx"
import type { ConnectionDetails } from "@/state/valkey-features/connection/connectionSlice.ts"

interface ConnectionModalProps {
  open: boolean
  onClose: () => void
  title: string
  description: string
  errorMessage?: string
  connectionDetails: ConnectionDetails
  onConnectionDetailsChange: (details: ConnectionDetails) => void
  onSubmit: (e: FormEvent) => void
  isSubmitDisabled: boolean
  submitButtonText: string
  isConnecting?: boolean
  showConnectionLimitWarning: boolean
  showVerifyTlsCertificate?: boolean
}

export function ConnectionModal({
  open,
  onClose,
  title,
  description,
  errorMessage,
  connectionDetails,
  onConnectionDetailsChange,
  onSubmit,
  isSubmitDisabled,
  submitButtonText,
  isConnecting = false,
  showConnectionLimitWarning,
  showVerifyTlsCertificate = true,
}: ConnectionModalProps) {

  return (
    <Dialog.Root onOpenChange={onClose} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-black/50" />
        <Dialog.Content asChild>
          <div className="fixed inset-0 z-40 flex items-center justify-center">
            <div className="w-full max-w-md p-6 bg-white dark:bg-tw-dark-primary dark:border-tw-dark-border rounded-lg shadow-lg border">
              <div className="flex justify-between">
                <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
                <Dialog.Close asChild>
                  <Button className="hover:text-tw-primary h-auto p-0" variant="ghost">
                    <X size={20} />
                  </Button>
                </Dialog.Close>
              </div>
              <Dialog.Description className="text-sm font-light">
                {description}
              </Dialog.Description>

              {errorMessage && (
                <div className="mt-4 p-1 text-sm bg-tw-primary/20 text-red-500 border rounded">
                  {errorMessage}
                </div>
              )}

              <form className="space-y-4 mt-4" onSubmit={onSubmit}>
                <div>
                  <label className="block mb-1 text-sm" htmlFor="host">
                    Host
                  </label>
                  <Input
                    id="host"
                    onChange={(e) =>
                      onConnectionDetailsChange({ ...connectionDetails, host: e.target.value })
                    }
                    placeholder="localhost"
                    required
                    type="text"
                    value={connectionDetails.host}
                  />
                </div>

                <div>
                  <label className="block mb-1 text-sm" htmlFor="port">
                    Port
                  </label>
                  <Input
                    id="port"
                    onChange={(e) =>
                      onConnectionDetailsChange({ ...connectionDetails, port: e.target.value })
                    }
                    placeholder="6379"
                    required
                    type="number"
                    value={connectionDetails.port}
                  />
                </div>

                <div>
                  <label className="block mb-1 text-sm" htmlFor="alias">
                    Alias
                  </label>
                  <Input
                    className="placeholder:text-xs"
                    id="alias"
                    onChange={(e) =>
                      onConnectionDetailsChange({ ...connectionDetails, alias: e.target.value })
                    }
                    placeholder="Alias of the first cluster node will be the alias of the cluster"
                    type="text"
                    value={connectionDetails.alias}
                  />
                </div>

                <div>
                  <label className="block mb-1 text-sm" htmlFor="username">
                    Username
                  </label>
                  <Input
                    id="username"
                    onChange={(e) =>
                      onConnectionDetailsChange({ ...connectionDetails, username: e.target.value })
                    }
                    type="text"
                    value={connectionDetails.username}
                  />
                </div>

                <div>
                  <label className="block mb-1 text-sm" htmlFor="password">
                    Password
                  </label>
                  <Input
                    id="password"
                    onChange={(e) =>
                      onConnectionDetailsChange({ ...connectionDetails, password: e.target.value })
                    }
                    type="password"
                    value={connectionDetails.password}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    checked={connectionDetails.tls}
                    className="h-4 w-4"
                    id="tls"
                    onChange={(e) =>
                      onConnectionDetailsChange({
                        ...connectionDetails,
                        tls: e.target.checked,
                      })
                    }
                    type="checkbox"
                  />
                  <label className="text-sm select-none" htmlFor="tls">
                    {showVerifyTlsCertificate ? "Use TLS" : "TLS"}
                  </label>
                </div>

                {showVerifyTlsCertificate && (
                  <div className="flex items-center gap-2">
                    <input
                      checked={connectionDetails.verifyTlsCertificate}
                      className="h-4 w-4"
                      id="verifycert"
                      onChange={(e) =>
                        onConnectionDetailsChange({
                          ...connectionDetails,
                          verifyTlsCertificate: e.target.checked,
                        })
                      }
                      type="checkbox"
                    />
                    <label className="text-sm select-none" htmlFor="verifycert">
                      Verify TLS Certificate
                    </label>
                  </div>
                )}

                {showConnectionLimitWarning && (
                  <div className="mt-4 p-2 text-sm bg-yellow-100 text-yellow-800 border rounded">
                    You've reached the maximum of {MAX_CONNECTIONS} active connections.
                    Please disconnect one before connecting to another.
                  </div>
                )}

                <div className="pt-2 text-sm">
                  <Button
                    className="w-full"
                    disabled={isSubmitDisabled}
                    title={
                      showConnectionLimitWarning
                        ? `Disconnect one of your ${MAX_CONNECTIONS} active connections to continue`
                        : undefined
                    }
                    type="submit"
                  >
                    {isConnecting && <Loader2 className="animate-spin" size={16} />}
                    {submitButtonText}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
