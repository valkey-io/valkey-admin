import { useSelector } from "react-redux"
import { Server } from "lucide-react"
import { useParams } from "react-router"
import { AppHeader } from "./ui/app-header"
import ClusterNode from "./ui/cluster-node"
import { selectCluster } from "@/state/valkey-features/cluster/clusterSelectors"
import { useNavigate } from "react-router"
import { Button } from "./ui/button"

export function Cluster() {
  const { clusterId, id } = useParams()
  const clusterData = useSelector(selectCluster(clusterId!))
  const navigate = useNavigate()

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

  return (
    <div className="p-4">
      <AppHeader icon={<Server size={20} />} title="Cluster Topology" />

      <div className="flex flex-wrap gap-4 mt-4">
        {clusterEntries.map(([primaryKey, primary]) => (
          <ClusterNode
            allNodeData={clusterData.data}
            clusterId={clusterId!}
            key={primaryKey}
            primary={primary}
            primaryData={clusterData.data[primaryKey]}
            primaryKey={primaryKey}
          />
        ))}
      </div>
      <Button 
      onClick={() => navigate(`/${clusterId}/${id}/monitoring-slots`)}
      className="mt-4 font-light"
      >View cluster HeatMap</Button>
    </div>
  )
}
