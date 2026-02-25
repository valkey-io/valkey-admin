import { LayoutDashboard, Terminal, PowerIcon, Server, MemoryStick, Users } from "lucide-react"
import { useNavigate } from "react-router"
import { useSelector } from "react-redux"
import { CONNECTED, MAX_CONNECTIONS } from "@common/src/constants.ts"
import { TooltipProvider } from "@radix-ui/react-tooltip"
import { Badge } from "../ui/badge"
import { CustomTooltip } from "../ui/tooltip"
import { Button } from "../ui/button"
import { Typography } from "../ui/typography"
import type { RootState } from "@/store.ts"
import type { PrimaryNode, ParsedNodeInfo } from "@/state/valkey-features/cluster/clusterSlice"
import { connectPending, type ConnectionDetails } from "@/state/valkey-features/connection/connectionSlice.ts"
import { useAppDispatch } from "@/hooks/hooks"
import { selectIsAtConnectionLimit } from "@/state/valkey-features/connection/connectionSelectors"
import { cn } from "@/lib/utils"

interface ClusterNodeProps {
  primaryKey: string
  primary: PrimaryNode
  primaryData: ParsedNodeInfo
  clusterId: string
}

export function ClusterNode({
  primaryKey,
  primary,
  primaryData,
  clusterId,
}: ClusterNodeProps) {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()

  const connectionId = primaryKey
  const connectionStatus = useSelector((state: RootState) =>
    state.valkeyConnection?.connections?.[connectionId]?.status,
  )
  const isConnected = connectionStatus === CONNECTED
  const isDisabled = useSelector(selectIsAtConnectionLimit) 

  const handleNodeConnect = () => {
    if (!isConnected) {
      const connectionDetails: ConnectionDetails = {
        host: primary.host,
        port: primary.port.toString(),
        ...(primary.username && primary.password && {
          username: primary.username,
          password: primary.password,
        }),
        tls: primary.tls,
        verifyTlsCertificate: primary.verifyTlsCertificate,
        ...(primary.caCertPath && {
          caCertPath: primary.caCertPath,
        }),
      }
      dispatch(connectPending({
        connectionId,
        connectionDetails,
      }))
    }
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
              <Server className="text-tw-primary shrink-0" size={18} />
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Typography variant={"label"}>{primaryData?.server_name || primaryKey}</Typography>
                  <Badge className="text-xs px-2 py-0" variant={isConnected ? "success" : "secondary"}>
                    PRIMARY
                  </Badge>
                </div>
                <Typography variant="bodyXs">{`${primary.host}:${primary.port}`}</Typography>
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
                      <Server className="text-tw-primary shrink-0" size={16} />
                      <Typography className="underline" variant="bodyXs">{replicaKey}</Typography>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <CustomTooltip content={`${isConnected ? "Connected" : isDisabled ? `Max connections of ${MAX_CONNECTIONS} reached` : "Not Connected" }`}>
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
    </div>
  )
}
