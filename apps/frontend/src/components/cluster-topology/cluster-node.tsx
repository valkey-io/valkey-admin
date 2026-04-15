import * as R from "ramda"
import { useState } from "react"
import { LayoutDashboard, Terminal, PowerIcon, Server, MemoryStick, Users } from "lucide-react"
import { useNavigate } from "react-router"
import { useSelector } from "react-redux"
import { CONNECTED, CONNECTING, ERROR, MAX_CONNECTIONS } from "@common/src/constants.ts"
import { TooltipProvider } from "@radix-ui/react-tooltip"
import { Badge } from "../ui/badge"
import { CustomTooltip } from "../ui/tooltip"
import { Button } from "../ui/button"
import { Typography } from "../ui/typography"
import { HighlightSearchMatch } from "../ui/highlight-search-match"
import { PasswordPromptModal } from "../ui/password-prompt-modal"
import type { RootState } from "@/store.ts"
import type { PrimaryNode, ParsedNodeInfo } from "@/state/valkey-features/cluster/clusterSlice"
import { connectPending, type ConnectionDetails } from "@/state/valkey-features/connection/connectionSlice.ts"
import { useAppDispatch } from "@/hooks/hooks"
import {
  selectIsAtConnectionLimit, selectEncryptedPassword
} from "@/state/valkey-features/connection/connectionSelectors"
import { secureStorage } from "@/utils/secureStorage.ts"
import { cn } from "@/lib/utils"

interface ClusterNodeProps {
  primaryKey: string
  primary: PrimaryNode
  primaryData: ParsedNodeInfo
  clusterId: string
  highlight?: string
}

export function ClusterNode({
  primaryKey,
  primary,
  primaryData,
  clusterId,
  highlight = "",
}: ClusterNodeProps) {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const connectionId = primaryKey
  const connectionStatus = useSelector((state: RootState) =>
    state.valkeyConnection?.connections?.[connectionId]?.status,
  )

  const isConnected = connectionStatus === CONNECTED

  const isDisabled = useSelector(selectIsAtConnectionLimit)

  // Look up encrypted password from an existing connection in the same cluster.
  // Available when secureStorage was active during the original connection.
  const encryptedPassword = useSelector(selectEncryptedPassword(clusterId))

  const [showPasswordModal, setShowPasswordModal] = useState(false)

  const baseDetails: ConnectionDetails = {
    host: primary.host,
    port: primary.port.toString(),
    tls: primary.tls,
    verifyTlsCertificate: primary.verifyTlsCertificate,
    endpointType: "node",
  }

  const handleNodeConnect = () => {
    if (isConnected) return

    if (primary.authType === "iam") {
      // IAM: all fields available from cluster state, no password needed
      dispatch(connectPending({
        connectionId,
        connectionDetails: {
          ...baseDetails,
          username: primary.username ?? "",
          authType: "iam",
          awsRegion: primary.awsRegion,
          awsReplicationGroupId: primary.awsReplicationGroupId,
        },
      }))
    } else if (R.isNotNil(encryptedPassword)) {
      // Password already encrypted from existing cluster connection — do NOT re-encrypt
      dispatch(connectPending({
        connectionId,
        connectionDetails: {
          ...baseDetails,
          username: primary.username ?? "",
          password: encryptedPassword,
        },
      }))
    } else {
      // No stored password — prompt for password
      setShowPasswordModal(true)
    }
  }

  const handlePasswordSubmit = async (password: string) => {
    const encryptedPw = await secureStorage.encryptIfAvailable(password)
    dispatch(connectPending({
      connectionId,
      connectionDetails: {
        ...baseDetails,
        username: primary.username ?? "",
        password: encryptedPw,
      },
    }))
  }

  const NodeDetails = ({ nodeData }: { nodeData: ParsedNodeInfo }) => (
    <div className="flex items-center gap-2 text-xs">
      <div className="flex items-center gap-1">
        <MemoryStick className="text-primary" size={14} />
        <Typography variant="bodyXs">{nodeData?.used_memory_human ?? "N/A"}</Typography>
      </div>
      <div className="flex items-center gap-1">
        <Users className="text-primary" size={14} />
        <Typography variant="bodyXs">{nodeData?.connected_clients ?? "N/A"}</Typography>
      </div>
    </div>
  )

  return (
    <div className="w-full">
      <TooltipProvider>
        <div className="px-4 py-3 border border-input rounded-md shadow-xs hover:border-primary/50">
          <div className="flex items-stretch gap-4">
            {/* Primary Node Section */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Server className="text-primary shrink-0" size={18} />
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Typography variant={"label"}>
                    <HighlightSearchMatch query={highlight} text={primaryData?.server_name || primaryKey} />
                  </Typography>
                  <Badge className="text-xs px-2 py-0" variant={isConnected ? "success" : "secondary"}>
                    PRIMARY
                  </Badge>
                </div>
                <Typography variant="bodyXs"><HighlightSearchMatch query={highlight} text={`${primary.host}:${primary.port}`} /></Typography>
                <NodeDetails nodeData={primaryData} />
              </div>
            </div>

            {/* Divider */}
            {primary.replicas.length > 0 && (
              <div className="w-px bg-tw-dark-border/30 shrink-0" />
            )}

            {/* Replicas Section */}
            {primary.replicas.length > 0 && (
              <div className="items-center gap-3 overflow-x-auto flex-1">
                <Badge className="text-xs px-2 py-0 mb-2" variant="secondary">
                  REPLICA{primary.replicas.length > 1 ? "S" : ""}
                </Badge>
                {primary.replicas.map((replica) => {
                  const replicaKey = `${replica.host}:${replica.port}`
                  return (
                    <div className="flex items-center mb-2 gap-1" key={replicaKey}>
                      <Server className="text-primary shrink-0" size={16} />
                      <Typography className="underline" variant="bodyXs">
                        <HighlightSearchMatch query={highlight} text={replicaKey} />
                      </Typography>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <CustomTooltip content={`${isConnected ? "Connected" : isDisabled ? `Max connections of ${MAX_CONNECTIONS} reached` : "Not Connected"}`}>
                <PowerIcon
                  className={cn(
                    "rounded-full p-0.5",
                    isConnected && "text-green-500 bg-green-100",
                    !isConnected && isDisabled && "text-gray-300 cursor-not-allowed bg-gray-100",
                    !isConnected && !isDisabled && "text-gray-400 cursor-pointer bg-gray-100 hover:text-gray-600",
                  )}
                  onClick={isDisabled ? undefined : handleNodeConnect}
                  size={18}
                />
              </CustomTooltip>
              <CustomTooltip content="Dashboard">
                <Button
                  aria-label="Dashboard"
                  className="h-8 w-8 p-0"
                  disabled={!isConnected}
                  onClick={() => navigate(`/${clusterId}/${connectionId}/dashboard`)}
                  size="sm"
                  variant="ghost"
                >
                  <LayoutDashboard size={16} />
                </Button>
              </CustomTooltip>
              <CustomTooltip content="Command">
                <Button
                  aria-label="Command"
                  className="h-8 w-8 p-0"
                  disabled={!isConnected}
                  onClick={() => navigate(`/${clusterId}/${connectionId}/sendcommand`)}
                  size="sm"
                  variant="ghost"
                >
                  <Terminal size={16} />
                </Button>
              </CustomTooltip>
            </div>
          </div>
        </div>
      </TooltipProvider>
      <PasswordPromptModal
        connectionLabel={`${primary.host}:${primary.port}`}
        errorMessage={connectionStatus === ERROR ? "Connection failed. Check your password and try again." : undefined}
        isConnecting={connectionStatus === CONNECTING}
        onClose={() => setShowPasswordModal(false)}
        onSubmit={handlePasswordSubmit}
        open={showPasswordModal && connectionStatus !== CONNECTED}
      />
    </div>
  )
}
