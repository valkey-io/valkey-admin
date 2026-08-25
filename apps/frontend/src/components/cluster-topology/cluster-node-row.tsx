import * as R from "ramda"
import { useState } from "react"
import { LayoutDashboard, Terminal, PowerIcon, Loader2, Server } from "lucide-react"
import { useNavigate } from "react-router"
import { useSelector } from "react-redux"
import { CONNECTED, CONNECTING, ERROR, MAX_CONNECTIONS } from "@common/src/constants.ts"
import { buildConnectionId } from "@common/src/connection-id.ts"
import { calculateHitRatio } from "@common/src/cache-hit-ratio.ts"
import { formatBytes } from "@common/src/bytes-conversion.ts"
import { TooltipProvider } from "@radix-ui/react-tooltip"
import { Badge } from "../ui/badge"
import { CustomTooltip } from "../ui/tooltip"
import { Button } from "../ui/button"
import { Typography } from "../ui/typography"
import { HighlightSearchMatch } from "../ui/highlight-search-match"
import { PasswordPromptModal } from "../ui/password-prompt-modal"
import { formatRate, formatPercent } from "./node-metrics"
import type { RootState } from "@/store.ts"
import type { PrimaryNode, ParsedNodeInfo, NodeUtilization, NodeRole } from "@/state/valkey-features/cluster/clusterSlice"
import { getUtilizationLevel, type UtilizationLevel } from "@/state/valkey-features/cluster/clusterUtilization"
import { connectPending, type ConnectionDetails } from "@/state/valkey-features/connection/connectionSlice.ts"
import { useAppDispatch } from "@/hooks/hooks"
import {
  selectIsAtConnectionLimit, selectEncryptedPassword, selectClusterDb
} from "@/state/valkey-features/connection/connectionSelectors"
import { secureStorage } from "@/utils/secureStorage.ts"
import { cn } from "@/lib/utils"

const UTILIZATION_BADGE: Record<UtilizationLevel, { label: string, variant: "secondary" | "success" | "destructive" }> = {
  low: { label: "Low", variant: "secondary" },
  normal: { label: "Normal", variant: "success" },
  high: { label: "High", variant: "destructive" },
}

interface ClusterNodeRowProps {
  host: string
  port: number
  role: NodeRole
  displayName: string
  // Connection settings live on the primary; replicas inherit them and are not connectable.
  primaryConfig: PrimaryNode
  nodeData?: ParsedNodeInfo
  utilization?: NodeUtilization
  clusterId: string
  highlight?: string
  isGroupEnd?: boolean
}

export function ClusterNodeRow({
  host,
  port,
  role,
  displayName,
  primaryConfig,
  nodeData,
  utilization,
  clusterId,
  highlight = "",
  isGroupEnd = true,
}: ClusterNodeRowProps) {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  // Inherit the parent cluster's Database_Index so node connections target the
  // same logical database (defaults to 0 when no cluster connection is found).
  const clusterDb = useSelector(selectClusterDb(clusterId))

  // Match the db-aware id scheme from buildConnectionId so the seed node
  // resolves to its status here, and node connects reuse that id
  // instead of creating a db id less duplicate.
  const connectionId = buildConnectionId(host, port, clusterDb)

  const connectionStatus = useSelector((state: RootState) =>
    state.valkeyConnection?.connections?.[connectionId]?.status,
  )

  const isConnected = connectionStatus === CONNECTED
  const isConnecting = connectionStatus === CONNECTING
  const isError = connectionStatus === ERROR

  const isDisabled = useSelector(selectIsAtConnectionLimit)

  // Look up encrypted password from an existing connection in the same cluster.
  // Available when secureStorage was active during the original connection.
  const encryptedPassword = useSelector(selectEncryptedPassword(clusterId))

  const [showPasswordModal, setShowPasswordModal] = useState(false)

  const baseDetails: ConnectionDetails = {
    host,
    port: port.toString(),
    tls: primaryConfig.tls,
    verifyTlsCertificate: primaryConfig.verifyTlsCertificate,
    endpointType: "node",
    db: clusterDb,
  }

  const handleNodeConnect = () => {
    if (isConnected || isConnecting) return

    if (primaryConfig.authType === "iam") {
      // IAM: all fields available from cluster state, no password needed
      dispatch(connectPending({
        connectionId,
        connectionDetails: {
          ...baseDetails,
          username: primaryConfig.username ?? "",
          authType: "iam",
          awsRegion: primaryConfig.awsRegion,
          awsReplicationGroupId: primaryConfig.awsReplicationGroupId,
        },
      }))
    } else if (R.isNotNil(encryptedPassword)) {
      // Password already encrypted from existing cluster connection — do NOT re-encrypt
      dispatch(connectPending({
        connectionId,
        connectionDetails: {
          ...baseDetails,
          username: primaryConfig.username ?? "",
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
        username: primaryConfig.username ?? "",
        password: encryptedPw,
      },
    }))
  }

  // memory_limit_bytes is null only when the node itself reported no limit.
  const memoryLabel = utilization
    ? `${nodeData?.used_memory_human ?? "—"} / ${utilization.memory_limit_bytes ? formatBytes(utilization.memory_limit_bytes) : "∞"}`
    : "—"
  const isHostMemoryBasis = utilization?.memory_basis === "total_system_memory"
  const utilizationLevel = getUtilizationLevel(utilization?.memory_utilization_percent, utilization?.cpu_utilization_percent)
  const isFlagged = role === "primary" && utilizationLevel === "high"

  const memoryTooltip = isHostMemoryBasis
    ? `${formatPercent(utilization?.memory_utilization_percent)} of host RAM — no maxmemory set`
    : `${formatPercent(utilization?.memory_utilization_percent)} of configured maxmemory`
  const utilizationTooltip = `Memory: ${memoryTooltip} · CPU: ${formatPercent(utilization?.cpu_utilization_percent)}`

  const hitRatio = nodeData
    ? calculateHitRatio(Number(nodeData.keyspace_hits) || 0, Number(nodeData.keyspace_misses) || 0)
    : "—"

  const powerIconTooltip = isConnected   ? "Connected"
    : isConnecting ? "Connecting..."
      : isError      ? "Connection failed — click to retry"
        : isDisabled   ? `Max connections of ${MAX_CONNECTIONS} reached`
          :                "Not Connected"

  return (
    <tr
      className={cn(
        "group transition-all duration-200",
        isFlagged ? "bg-destructive/10 hover:bg-destructive/15" : "hover:bg-gray-50 dark:hover:bg-neutral-800/50",
        isGroupEnd ? "border-b dark:border-tw-dark-border" : "border-b border-gray-100 dark:border-neutral-800/50",
      )}
    >
      <td className="px-4 py-3 w-10">
        {role === "primary" && <Server className="text-primary" size={16} />}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Typography variant="label">
                <HighlightSearchMatch query={highlight} text={displayName} />
              </Typography>
              <Badge className="text-[10px] px-2 py-0" variant={role === "primary" ? "default" : "secondary"}>
                {role === "primary" ? "PRIMARY" : "REPLICA"}
              </Badge>
            </div>
            <Typography variant="bodyXs">
              <HighlightSearchMatch query={highlight} text={`${host}:${port}`} />
            </Typography>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 w-[10%] text-center">
        {role === "primary" && utilizationLevel && (
          <TooltipProvider>
            <CustomTooltip content={utilizationTooltip}>
              <Badge
                className={cn("text-[10px] px-2 py-0", isHostMemoryBasis && "border-dashed")}
                variant={UTILIZATION_BADGE[utilizationLevel].variant}
              >
                {UTILIZATION_BADGE[utilizationLevel].label}
              </Badge>
            </CustomTooltip>
          </TooltipProvider>
        )}
      </td>
      <td className="px-2 py-3 w-[10%]">
        {role === "primary" && (
          <Typography variant="bodyXs">
            {memoryLabel}
          </Typography>
        )}
      </td>
      <td className="px-4 py-3 w-[8%] text-center">
        {role === "primary" && (
          <Typography variant="bodyXs">
            {formatPercent(utilization?.cpu_utilization_percent)}
          </Typography>
        )}
      </td>
      <td className="px-4 py-3 w-[10%] text-center">
        {role === "primary" && (
          <Typography variant="bodyXs">
            {nodeData?.instantaneous_ops_per_sec ? formatRate(Number(nodeData.instantaneous_ops_per_sec)) : "—"}
          </Typography>
        )}
      </td>
      <td className="px-4 py-3 w-[10%] text-center">
        {role === "primary" && <Typography variant="bodyXs">{hitRatio}</Typography>}
      </td>
      <td className="px-4 py-3 w-[8%] text-center">
        {role === "primary" && <Typography variant="bodyXs">{nodeData?.connected_clients ?? "—"}</Typography>}
      </td>
      <td className="px-4 py-3 w-[14%]">
        {role === "primary" && (
          <TooltipProvider>
            <div className="flex items-center justify-center gap-2">
              <CustomTooltip content={powerIconTooltip}>
                {isConnecting ? (
                  <Loader2
                    className="animate-spin text-gray-500"
                    size={21}
                  />
                ) : (
                  <PowerIcon
                    className={cn(
                      "rounded-full p-0.5 border-2",
                      isConnected && "text-green-500 border-green-500",
                      isError && "text-red-500 cursor-pointer border-red-500",
                      !isConnected && !isError && isDisabled && "text-gray-300 border-gray-300 cursor-not-allowed",
                      !isConnected && !isError && !isDisabled && "text-gray-400 border-gray-400 cursor-pointer",
                    )}
                    onClick={isDisabled ? undefined : handleNodeConnect}
                    size={21}
                  />
                )}
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
          </TooltipProvider>
        )}
      </td>
      {role === "primary" && (
        <PasswordPromptModal
          connectionLabel={`${host}:${port}`}
          errorMessage={connectionStatus === ERROR ? "Connection failed. Check your password and try again." : undefined}
          isConnecting={connectionStatus === CONNECTING}
          onClose={() => setShowPasswordModal(false)}
          onSubmit={handlePasswordSubmit}
          open={showPasswordModal && connectionStatus !== CONNECTED}
        />
      )}
    </tr>
  )
}
