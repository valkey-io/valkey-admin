import { AlertTriangle, Loader2, X } from "lucide-react"
import { type FormEvent } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { MAX_CONNECTIONS } from "@common/src/constants.ts"
import { Alert, AlertDescription } from "./alert.tsx"
import { Button } from "./button.tsx"
import { Input } from "./input.tsx"
import { Typography } from "./typography.tsx"
import { RadioGroup, RadioGroupItem } from "./radio-group.tsx"
import type { ConnectionDetails } from "@/state/valkey-features/connection/connectionSlice.ts"
import { Label } from "@/components/ui/label"

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
                <Dialog.Title asChild>
                  <Typography variant="subheading">{title}</Typography>
                </Dialog.Title>
                <Dialog.Close asChild>
                  <Button className="hover:text-primary h-auto p-0" variant="ghost">
                    <X size={20} />
                  </Button>
                </Dialog.Close>
              </div>
              <Dialog.Description asChild>
                <Typography variant="bodySm">{description}</Typography>
              </Dialog.Description>

              {errorMessage && (
                <Alert className="mt-4" variant="destructive">
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}

              <form className="space-y-4 mt-4" onSubmit={onSubmit}>

                <div className="flex flex-col gap-2">
                  <Label>Endpoint Type</Label>
                  <RadioGroup
                    onValueChange={(value) =>
                      onConnectionDetailsChange({ ...connectionDetails, endpointType: value as ConnectionDetails["endpointType"] })
                    }
                    value={connectionDetails.endpointType}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem id="endpoint-node" value="node" />
                      <Label htmlFor="endpoint-node">Node</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem id="endpoint-cluster" value="cluster-endpoint" />
                      <Label htmlFor="endpoint-cluster">Discovery Endpoint</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div>
                  <Label className="block mb-1" htmlFor="host">
                    Host
                  </Label>
                  <Input
                    id="host"
                    onChange={(e) => {
                      const host = e.target.value
                      onConnectionDetailsChange({ 
                        ...connectionDetails, 
                        host,
                        endpointType: host.includes("cfg") ? "cluster-endpoint" : connectionDetails.endpointType,
                      })
                    }
                    }
                    placeholder="localhost"
                    required
                    type="text"
                    value={connectionDetails.host}
                  />
                </div>

                <div>
                  <Label className="block mb-1" htmlFor="port">
                    Port
                  </Label>
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
                  <Label className="block mb-1" htmlFor="alias">
                    Alias
                  </Label>
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

                <div className="flex flex-col gap-2">
                  <Label>Auth Type</Label>
                  <RadioGroup
                    onValueChange={(value) =>
                      onConnectionDetailsChange({ ...connectionDetails, authType: value as "password" | "iam" })
                    }
                    value={connectionDetails.authType ?? "password"}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem id="auth-password" value="password" />
                      <Label htmlFor="auth-password">Password</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem id="auth-iam" value="iam" />
                      <Label htmlFor="auth-iam">IAM</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div>
                  <Label className="block mb-1" htmlFor="username">
                    Username
                  </Label>
                  <Input
                    id="username"
                    onChange={(e) =>
                      onConnectionDetailsChange({ ...connectionDetails, username: e.target.value })
                    }
                    type="text"
                    value={connectionDetails.username}
                  />
                </div>

                {connectionDetails.authType === "iam" ? (
                  <>
                    <div>
                      <Label className="block mb-1" htmlFor="awsRegion">AWS Region</Label>
                      <Input
                        id="awsRegion"
                        onChange={(e) =>
                          onConnectionDetailsChange({ ...connectionDetails, awsRegion: e.target.value })
                        }
                        type="text"
                        value={connectionDetails.awsRegion ?? ""}
                      />
                    </div>
                    <div>
                      <Label className="block mb-1" htmlFor="awsClusterName">Replication Group ID</Label>
                      <Input
                        id="awsClusterName"
                        onChange={(e) =>
                          onConnectionDetailsChange({ ...connectionDetails, awsReplicationGroupId: e.target.value })
                        }
                        type="text"
                        value={connectionDetails.awsReplicationGroupId ?? ""}
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <Label className="block mb-1" htmlFor="password">
                      Password
                    </Label>
                    <Input
                      id="password"
                      onChange={(e) =>
                        onConnectionDetailsChange({ ...connectionDetails, password: e.target.value })
                      }
                      type="password"
                      value={connectionDetails.password}
                    />
                  </div>
                )}

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
                  <Label className="select-none" htmlFor="tls">
                    {showVerifyTlsCertificate ? "Use TLS" : "TLS"}
                  </Label>
                </div>
                {!connectionDetails.tls && (
                  <Alert variant="warning">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Disabling TLS means your connection will not be encrypted.
                    </AlertDescription>
                  </Alert>
                )}
                {showVerifyTlsCertificate && (
                  <>
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
                      <Label className="select-none" htmlFor="verifycert">
                        Verify TLS Certificate
                      </Label>
                    </div>
                    {connectionDetails.tls && !connectionDetails.verifyTlsCertificate && (
                      <Alert variant="warning">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          Disabling certificate verification makes the connection vulnerable to man-in-the-middle attacks.
                        </AlertDescription>
                      </Alert>
                    )}
                  </>
                )}

                {showConnectionLimitWarning && (
                  <Alert className="mt-4" variant="warning">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      You've reached the maximum of {MAX_CONNECTIONS} active connections.
                      Please disconnect one before connecting to another.
                    </AlertDescription>
                  </Alert>
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
