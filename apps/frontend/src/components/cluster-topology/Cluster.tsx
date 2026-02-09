import { useState } from "react"
import { useSelector } from "react-redux"
import { Server, CheckCircle2 } from "lucide-react"
import { useParams } from "react-router"
import { CONNECTED } from "@common/src/constants.ts"
import { AppHeader } from "../ui/app-header"
import RouteContainer from "../ui/route-container"
import { StatCard } from "../ui/stat-card"
import { SearchInput } from "../ui/search-input"
import { ClusterNode } from "./cluster-node"
import { Panel } from "../ui/panel"
import type { RootState } from "@/store.ts"
import { selectCluster } from "@/state/valkey-features/cluster/clusterSelectors"

export function Cluster() {
  const { clusterId } = useParams()
  const clusterData = useSelector(selectCluster(clusterId!))
  const [searchQuery, setSearchQuery] = useState("")

  const connectionStatuses = useSelector((state: RootState) =>
    state.valkeyConnection?.connections || {},
  )

  if (!clusterData.clusterNodes || !clusterData.data) {
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

  // cluster stats
  const totalNodes = clusterEntries.length
  const connectedNodes = clusterEntries.filter(([primaryKey]) =>
    connectionStatuses[primaryKey]?.status === CONNECTED,
  ).length
  const totalReplicas = clusterEntries.reduce((sum, [, primary]) =>
    sum + primary.replicas.length, 0,
  )
  const totalClusterNodes = totalNodes + totalReplicas

  // filtering nodes based on search query
  const filteredEntries = clusterEntries.filter(([primaryKey, primary]) => {
    if (!searchQuery) return true

    // check primary node
    if (clusterData.searchableText[primaryKey]?.includes(searchQuery)) {
      return true
    }

    // check replicas
    return primary.replicas.some((replica) => {
      const replicaKey = `${replica.host}:${replica.port}`
      return clusterData.searchableText[replicaKey]?.includes(searchQuery)
    })
  })

  return (
    <RouteContainer className="overflow-y-hidden" title="Cluster Topology">
      <AppHeader icon={<Server size={20} />} title="Cluster Topology" />
      {/* Cluster Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Server className="text-tw-primary" size={20} />}
          label="Total Nodes"
          value={totalClusterNodes}
        />
        <StatCard
          icon={<Server className="text-tw-primary" size={20} />}
          label="Primary Nodes"
          value={totalNodes}
        />
        <StatCard
          icon={<Server className="text-tw-primary" size={20} />}
          label="Replicas"
          value={totalReplicas}
        />
        <StatCard
          icon={<CheckCircle2 className="text-green-500" size={20} />}
          label="Connected"
          value={connectedNodes}
        />
      </div>

      {/* Search */}
      <div className="">
        <SearchInput
          onChange={(e) => setSearchQuery(e.target.value.toLowerCase())}
          placeholder="Search nodes by name, host, or port..."
          value={searchQuery}
        />
      </div>

      {/* Cluster Topology List */}
      <Panel className="space-y-2 overflow-y-auto p-3">
        {filteredEntries.length === 0 ? (
          <div className="text-center py-8 text-tw-dark-border">
            No nodes found matching "{searchQuery}"
          </div>
        ) : (
          filteredEntries.map(([primaryKey, primary]) => {
            const primaryData = clusterData.data[primaryKey]
            return (
              <ClusterNode
                clusterId={clusterId!}
                key={primaryKey}
                primary={primary}
                primaryData={primaryData}
                primaryKey={primaryKey}
              />
            )
          })
        )}
      </Panel>
    </RouteContainer>
  )
}
