import * as R from "ramda"
import { useState } from "react"
import { LayoutDashboard, Terminal, Server } from "lucide-react"
import { useNavigate } from "react-router"
import { useSelector } from "react-redux"
import { CONNECTED, CONNECTING, ERROR } from "@common/src/constants.ts"
import { buildConnectionId } from "@common/src/connection-id.ts"
import { calculateHitRatio } from "@common/src/cache-hit-ratio.ts"
import { formatBytes } from "@common/src/bytes-conversion.ts"
import { TooltipProvider } from "@radix-ui/react-tooltip"
import { toast } from "sonner"
import { Badge } from "../ui/badge"
import { CustomTooltip } from "../ui/tooltip"
import { Button } from "../ui/button"
import { Typography } from "../ui/typography"
import { HighlightSearchMatch } from "../ui/highlight-search-match"
import { PasswordPromptModal } from "../ui/password-prompt-modal"
import { formatRate, formatPercent } from "./node-metrics"
import type { RootState } from "@/store.ts"
import type { PrimaryNode, ParsedNodeInfo, NodeUtilization, NodeRole } from "@/state/valkey-features/cluster/clusterSlice"
import { getNodeUtilizationLevel, hasMemoryLimit, type UtilizationLevel } from "@/state/valkey-features/cluster/clusterUtilization"
import { connectPending, type ConnectionDetails } from "@/state/valkey-features/connection/connectionSlice.ts"
import { useAppDispatch } from "@/hooks/hooks"
import {
  selectIsAtConnectionLimit, selectClusterPassword, selectClusterDb
} from "@/state/valkey-features/connection/connectionSelectors"
import { secureStorage, PASSWORD_NOT_STORED_WARNING } from "@/utils/secureStorage.ts"
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

  // Look up a stored password from an existing connection in the same cluster,
  // together with its isPasswordEncrypted marking.
  const clusterPassword = useSelector(selectClusterPassword(clusterId))

  const [showPasswordModal, setShowPasswordModal] = useState(false)

  const baseDetails: ConnectionDetails = {
    host,
    port: port.toString(),
    tls: primaryConfig.tls,
    verifyTlsCertificate: primaryConfig.verifyTlsCertificate,
    caCertPath: primaryConfig.caCertPath,
    endpointType: "node",
    db: clusterDb,
  }

  const [pendingTargetRoute, setPendingTargetRoute] = useState<string | null>(null)

  const handleNodeConnect = (targetRoute?: string) => {
    if (isConnected) {
      if (targetRoute) navigate(targetRoute)
      return
    }

    if (isConnecting) {
      if (targetRoute) navigate(targetRoute)
      return
    }

    if (isDisabled) {
      if (targetRoute) navigate(targetRoute)
      return
    }

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
      if (targetRoute) navigate(targetRoute)
    } else if (primaryConfig.authType === "gcp-iam") {
      // GCP IAM: tokens are minted from ambient credentials, no password needed
      dispatch(connectPending({
        connectionId,
        connectionDetails: {
          ...baseDetails,
          username: primaryConfig.username ?? "",
          authType: "gcp-iam",
        },
      }))
      if (targetRoute) navigate(targetRoute)
    } else if (R.isNotNil(clusterPassword)) {
      // Reuse the sibling connection's stored password, carrying its
      // isPasswordEncrypted marking so an unencrypted one is still never persisted.
      dispatch(connectPending({
        connectionId,
        connectionDetails: {
          ...baseDetails,
          username: primaryConfig.username ?? "",
          password: clusterPassword.password,
        },
        isPasswordEncrypted: clusterPassword.isPasswordEncrypted,
      }))
      if (targetRoute) navigate(targetRoute)
    } else {
      // No stored password — keep the user on the current view to enter the password
      if (targetRoute) {
        setPendingTargetRoute(targetRoute)
      }
      setShowPasswordModal(true)
    }
  }

  const handlePasswordSubmit = async (password: string) => {
    const result = await secureStorage.encryptForStorage(password)
    if (!result.ok && secureStorage.isElectron()) toast.warning(PASSWORD_NOT_STORED_WARNING, { duration: 10_000 })
    dispatch(connectPending({
      connectionId,
      connectionDetails: {
        ...baseDetails,
        username: primaryConfig.username ?? "",
        password: result.ok ? result.value : password,
      },
      isPasswordEncrypted: result.ok,
    }))
    if (pendingTargetRoute) {
      const route = pendingTargetRoute
      setPendingTargetRoute(null)
      navigate(route)
    }
  }

  const hasLimit = hasMemoryLimit(utilization)
  const memoryLabel = utilization
    ? `${nodeData?.used_memory_human ?? "—"} / ${hasLimit && utilization.memory_limit_bytes ? formatBytes(utilization.memory_limit_bytes) : "∞"}`
    : "—"
  const isHostMemoryBasis = utilization?.memory_basis === "total_system_memory"
  const utilizationLevel = getNodeUtilizationLevel(utilization)
  const isFlagged = role === "primary" && utilizationLevel === "high"

  const memoryTooltip = hasLimit
    ? `${formatPercent(utilization?.memory_utilization_percent)} of configured maxmemory`
    : isHostMemoryBasis
      ? `${formatPercent(utilization?.memory_utilization_percent)} of host RAM — no maxmemory set, not counted`
      : "no maxmemory set, not counted"
  const utilizationTooltip = `Memory: ${memoryTooltip} · CPU: ${formatPercent(utilization?.cpu_utilization_percent)}`

  const hitRatio = nodeData
    ? calculateHitRatio(Number(nodeData.keyspace_hits) || 0, Number(nodeData.keyspace_misses) || 0)
    : "—"

  const isResponsive = Boolean(nodeData && (nodeData.role || nodeData.uptime_in_days || nodeData.used_memory))
  const isDegraded = isResponsive && utilizationLevel === "high"

  const healthStatus: "healthy" | "degraded" | "unreachable" = isError
    ? "unreachable"
    : !isResponsive
      ? "unreachable"
      : isDegraded
        ? "degraded"
        : "healthy"

  const healthTooltip = isError
    ? "Node Unreachable · Connection error"
    : healthStatus === "healthy"
      ? `Node Healthy · Responsive (${nodeData?.uptime_in_days ?? 0}d uptime)`
      : healthStatus === "degraded"
        ? "Node Degraded · High resource utilization"
        : "Node Unreachable · No metrics received"

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
              <Typography variant={role === "primary" ? "label" : "bodySm"}  >
                <HighlightSearchMatch query={highlight} text={`${host}:${port}`} />
              </Typography>
              <Badge className="text-[10px] px-2 py-0" variant={role === "primary" ? "default" : "secondary"}>
                {role === "primary" ? "PRIMARY" : "REPLICA"}
              </Badge>
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 w-[10%] text-center">
        {role === "primary" && utilizationLevel && (
          <TooltipProvider>
            <CustomTooltip content={utilizationTooltip}>
              <Badge
                className={cn("text-[10px] px-2 py-0", !hasLimit && "border-dashed")}
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
              <CustomTooltip content={healthTooltip}>
                <div
                  aria-label={healthTooltip}
                  className="flex items-center justify-center h-8 w-8 cursor-default"
                  role="status"
                >
                  <span
                    className={cn(
                      "h-3 w-3 rounded-full transition-colors duration-200 shadow-sm",
                      healthStatus === "healthy" && "bg-green-500 shadow-green-500/50",
                      healthStatus === "degraded" && "bg-amber-500 shadow-amber-500/50",
                      healthStatus === "unreachable" && "bg-red-500 shadow-red-500/50",
                    )}
                  />
                </div>
              </CustomTooltip>
              <CustomTooltip content="Dashboard">
                <Button
                  aria-label="Dashboard"
                  className="h-8 w-8 p-0"
                  onClick={() => {
                    const targetRoute = `/${clusterId}/${connectionId}/dashboard`
                    handleNodeConnect(targetRoute)
                  }}
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
                  onClick={() => {
                    const targetRoute = `/${clusterId}/${connectionId}/sendcommand`
                    handleNodeConnect(targetRoute)
                  }}
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
