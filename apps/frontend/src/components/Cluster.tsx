import { useSelector } from "react-redux"
import { Server } from "lucide-react"
import { useParams } from "react-router"
import { Card } from "./ui/card"
import { AppHeader } from "./ui/app-header"
import { selectClusterData } from "@/state/valkey-features/cluster/clusterSelectors"

export function Cluster() {
  const { clusterId } = useParams()
  const clusterData = useSelector(selectClusterData(clusterId!))

  return (
    <div className="p-4">
      <AppHeader icon={<Server size={20} />} title="Cluster Topology" />

      <div className="flex flex-wrap gap-4 mt-4">
        {Object.entries(clusterData).map(([nodeAddress, nodeInfo]) => (
          <Card className="flex flex-col p-4 w-[280px]" key={nodeAddress}>
            <div className="text-xl font-semibold mb-1 truncate">
              {nodeInfo.role?.toUpperCase() ?? "UNKNOWN"} 
            </div>
            <div className="text-sm text-muted-foreground mb-2">
              {nodeInfo.server_name ?? "Unnamed Node"}@ {nodeAddress}
            </div>

            <div className="text-sm space-y-1">
              <div>
                <span className="font-medium">Uptime:</span>{" "}
                {nodeInfo.uptime_in_days ?? "N/A"} days
              </div>
              <div>
                <span className="font-medium">Port:</span>{" "}
                {nodeInfo.tcp_port ?? "N/A"}
              </div>
              <div>
                <span className="font-medium">Memory:</span>{" "}
                {nodeInfo.used_memory_human ?? "N/A"}
              </div>
              <div>
                <span className="font-medium">CPU (sys):</span>{" "}
                {nodeInfo.used_cpu_sys ?? "N/A"}
              </div>
              <div>
                <span className="font-medium">Ops/sec:</span>{" "}
                {nodeInfo.instantaneous_ops_per_sec ?? "N/A"}
              </div>
              <div>
                <span className="font-medium">Commands:</span>{" "}
                {nodeInfo.total_commands_processed ?? "N/A"}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )

}
