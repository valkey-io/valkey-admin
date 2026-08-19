import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { Server, ListFilter } from "lucide-react"
import { useParams } from "react-router"
import { MAX_CONNECTIONS } from "@common/src/constants.ts"
import { truncateText } from "@common/src/truncate-text.ts"
import { formatBytes } from "@common/src/bytes-conversion.ts"
import { calculateHitRatio } from "@common/src/cache-hit-ratio.ts"
import { sanitizeUrl } from "@common/src/url-utils.ts"
import { AppHeader } from "../ui/app-header"
import RouteContainer from "../ui/route-container"
import { StatCard } from "../ui/stat-card"
import { SearchInput } from "../ui/search-input"
import { Select } from "../ui/select"
import { Typography } from "../ui/typography"
import { TableContainer } from "../ui/table-container"
import { StaticTableHeader } from "../ui/sortable-table-header"
import { ClusterNodeRow } from "./cluster-node-row"
import { getUtilizationLevel, type UtilizationLevel } from "./node-metrics"
import type { PrimaryNode } from "@/state/valkey-features/cluster/clusterSlice"
import { selectCluster } from "@/state/valkey-features/cluster/clusterSelectors"
import { useAppDispatch } from "@/hooks/hooks"
import { updateClusterData, stopClusterDataPolling } from "@/state/valkey-features/cluster/clusterSlice"
import { selectClusterAlias } from "@/state/valkey-features/connection/connectionSelectors"

type RoleFilter = "all" | "primary" | "replica"
type UtilizationFilter = "all" | UtilizationLevel

interface NodeRow {
  dataKey: string
  searchKey: string
  host: string
  port: number
  role: "primary" | "replica"
  primary: PrimaryNode
  isGroupEnd: boolean
}

export function Cluster() {
  const { id, clusterId } = useParams()
  const dispatch = useAppDispatch()
  useEffect(() => {
    dispatch(updateClusterData({ connectionId: id!, clusterId: clusterId! }))
    return () => {
      dispatch(stopClusterDataPolling({ clusterId: clusterId! }))
    }
  }, [id, clusterId, dispatch])
  const clusterData = useSelector(selectCluster(clusterId!))
  const [searchQuery, setSearchQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all")
  const [utilizationFilter, setUtilizationFilter] = useState<UtilizationFilter>("all")

  const clusterAlias = useSelector(selectClusterAlias(id!))

  if (!clusterData?.clusterNodes || !clusterData?.data) {
    return (
      <div className="p-4 h-full flex flex-col">
        <AppHeader icon={<Server size={20} />} title="Cluster Topology" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-tw-dark-border text-center">
            No cluster data available
          </div>
        </div>
      </div>
    )
  }

  const clusterEntries = Object.entries(clusterData.clusterNodes)

  const nodeRows: NodeRow[] = clusterEntries.flatMap(([primaryKey, primary]) => [
    {
      dataKey: primaryKey,
      searchKey: primaryKey,
      host: primary.host,
      port: primary.port,
      role: "primary" as const,
      primary,
      isGroupEnd: primary.replicas.length === 0,
    },
    ...primary.replicas.map((replica, index) => ({
      dataKey: sanitizeUrl(`${replica.host}-${replica.port}`),
      searchKey: `${replica.host}:${replica.port}`,
      host: replica.host,
      port: replica.port,
      role: "replica" as const,
      primary,
      isGroupEnd: index === primary.replicas.length - 1,
    })),
  ])

  let usedMemorySum = 0
  let memoryLimitSum = 0
  let opsPerSecSum = 0
  let hitsSum = 0
  let missesSum = 0
  let flaggedNodes = 0

  for (const row of nodeRows) {
    const nodeData = clusterData.data[row.dataKey]
    const nodeUtilization = clusterData.utilization?.[row.dataKey]

    usedMemorySum += nodeUtilization?.used_memory ?? (Number(nodeData?.used_memory) || 0)
    memoryLimitSum += nodeUtilization?.memory_limit_bytes ?? 0
    opsPerSecSum += Number(nodeData?.instantaneous_ops_per_sec) || 0
    hitsSum += Number(nodeData?.keyspace_hits) || 0
    missesSum += Number(nodeData?.keyspace_misses) || 0

    // Badges render on primaries only, so replicas must not inflate the count.
    if (row.role === "primary"
      && getUtilizationLevel(nodeUtilization?.memory_utilization_percent, nodeUtilization?.cpu_utilization_percent) === "high") {
      flaggedNodes += 1
    }
  }

  const clusterMemoryValue = (
    <span className="flex flex-wrap items-baseline justify-center gap-x-1">
      <span className="whitespace-nowrap">{formatBytes(usedMemorySum)}</span>
      <span className="text-base font-normal text-muted-foreground whitespace-nowrap">
        / {memoryLimitSum > 0 ? formatBytes(memoryLimitSum) : "∞"}
      </span>
    </span>
  )
  const totalOpsPerSecValue = `${Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(opsPerSecSum)}/s`
  const clusterHitRatioValue = calculateHitRatio(hitsSum, missesSum)

  // filtering nodes based on search query, role, and utilization
  const filteredRows = nodeRows.filter((row) => {
    const matchesSearch = !searchQuery || clusterData.searchableText[row.searchKey]?.includes(searchQuery)
    const matchesRole = roleFilter === "all" || row.role === roleFilter

    const rowUtilization = clusterData.utilization?.[row.dataKey]
    const level = getUtilizationLevel(rowUtilization?.memory_utilization_percent, rowUtilization?.cpu_utilization_percent)
    const matchesUtilization = utilizationFilter === "all"
      || (row.role === "primary" && level === utilizationFilter)

    return matchesSearch && matchesRole && matchesUtilization
  })

  const highlight = searchQuery && filteredRows.length < MAX_CONNECTIONS ? searchQuery : ""

  return (
    <RouteContainer className="overflow-y-hidden" title="Cluster Topology">
      <AppHeader
        description={
          <>
            Topology of cluster{" "}
            <span className="font-semibold text-primary">{truncateText(clusterAlias || clusterId!)}</span>
          </>
        }
        icon={<Server size={20} />}
        title="Cluster Topology"
      />
      {/* Cluster Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Total Nodes" value={nodeRows.length} />
        <StatCard label="Cluster Memory" value={clusterMemoryValue} />
        <StatCard label="Total Ops/Sec" value={totalOpsPerSecValue} />
        <StatCard label="Cluster Hit Ratio" value={clusterHitRatioValue} />
        <StatCard label="Nodes Flagged" value={flaggedNodes} />
      </div>

      {/* Search and filters */}
      <div className="flex items-center gap-2">
        <SearchInput
          onChange={(e) => setSearchQuery(e.target.value.toLowerCase())}
          placeholder="Search nodes by name, host, or port..."
          value={searchQuery}
        />
        <Select
          aria-label="Filter by role"
          className="w-40 shrink-0"
          icon={<ListFilter size={14} />}
          onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
          value={roleFilter}
        >
          <option value="all">All roles</option>
          <option value="primary">Primary</option>
          <option value="replica">Replica</option>
        </Select>
        <Select
          aria-label="Filter by utilization"
          className="w-44 shrink-0"
          icon={<ListFilter size={14} />}
          onChange={(e) => setUtilizationFilter(e.target.value as UtilizationFilter)}
          value={utilizationFilter}
        >
          <option value="all">All utilization</option>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </Select>
        <Typography className="shrink-0 whitespace-nowrap" variant="bodySm">
          Showing {filteredRows.length} of {nodeRows.length} nodes
        </Typography>
      </div>

      {/* Cluster Topology Table */}
      <TableContainer
        className="border border-input rounded-md shadow-xs"
        header={
          <>
            <StaticTableHeader label="" width="w-10" />
            <StaticTableHeader
              icon={<Server className="text-primary" size={16} />}
              label="Node"
              width="flex-1"
            />
            <StaticTableHeader className="text-center" label="Utilization" width="w-[10%]" />
            <StaticTableHeader label="Memory" width="w-[10%]" />
            <StaticTableHeader className="text-center" label="CPU" width="w-[8%]" />
            <StaticTableHeader className="text-center" label="Ops/Sec" width="w-[10%]" />
            <StaticTableHeader className="text-center" label="Hit Ratio" width="w-[10%]" />
            <StaticTableHeader className="text-center" label="Conns" width="w-[8%]" />
            <StaticTableHeader className="text-center" label="Actions" width="w-[14%]" />
          </>
        }
      >
        {filteredRows.length === 0 ? (
          <tr>
            <td className="px-4 py-8 text-center text-tw-dark-border" colSpan={9}>
              No nodes found matching "{searchQuery}"
            </td>
          </tr>
        ) : (
          filteredRows.map((row) => (
            <ClusterNodeRow
              clusterId={clusterId!}
              displayName={clusterData.data[row.dataKey]?.server_name || `${row.host}:${row.port}`}
              highlight={highlight}
              host={row.host}
              isGroupEnd={row.isGroupEnd}
              key={row.dataKey}
              nodeData={clusterData.data[row.dataKey]}
              port={row.port}
              primary={row.primary}
              role={row.role}
              utilization={clusterData.utilization?.[row.dataKey]}
            />
          ))
        )}
      </TableContainer>
    </RouteContainer>
  )
}
