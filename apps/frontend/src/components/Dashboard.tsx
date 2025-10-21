import { useSelector } from "react-redux"
import { LayoutDashboard } from "lucide-react"
import { useParams } from "react-router"
import { Card } from "./ui/card"
import { AppHeader } from "./ui/app-header"
import { selectData } from "@/state/valkey-features/info/infoSelectors.ts"
import { selectClusterData } from "@/state/valkey-features/cluster/clusterSelectors"
import { selectConnectionDetails } from "@/state/valkey-features/connection/connectionSelectors"

export function Dashboard() {
  const { id, clusterId } = useParams()
  const instanceData = useSelector(selectData(id!))
  const clusterData = useSelector(selectClusterData(clusterId!))
  const connectionDetails = useSelector(selectConnectionDetails(id!))
  const nodeAddress = `${connectionDetails.host}:${connectionDetails.port}`
  console.log("The cluster data is: ", clusterData)
  console.log("The node address is: ", nodeAddress)
  return (
    <div className="p-4">
      <AppHeader
        icon={<LayoutDashboard size={20} />}
        title="Dashboard"
      />
      <div className="flex flex-wrap gap-4">
        {[
          // eslint-disable-next-line max-len
          ["Total Commands Processed", (instanceData? instanceData.total_commands_processed : clusterData[nodeAddress].total_commands_processed)],
          ["Dataset Bytes", (instanceData ? instanceData.dataset_bytes : "N/A")], //TODO
          ["Connected Clients", (instanceData ? instanceData.connected_clients : clusterData[nodeAddress].connected_clients)],
          ["Keys Count", (instanceData ? instanceData.keys_count: "N/A")],//TODO
          ["Bytes per Key", (instanceData ? instanceData.bytes_per_key: "N/A")], //TODO
        ].map(([label, value]) => (
          <Card className="flex flex-col p-4 w-[200px]" key={label}>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-lg text-muted-foreground">{label}</div>
          </Card>
        ))}
      </div>
    </div>
  )

}
