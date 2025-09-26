import { useSelector } from "react-redux"
import { LayoutDashboard } from "lucide-react"
import { useParams } from "react-router"
import { Card } from "./ui/card"
import { AppHeader } from "./ui/app-header"
import { selectData } from "@/state/valkey-features/info/infoSelectors.ts"

export function Dashboard() {
  const { id } = useParams()
  const {
    total_commands_processed,
    dataset_bytes,
    connected_clients,
    keys_count,
    bytes_per_key,
  } = useSelector(selectData(id!))

  return (
    <div className="p-4">
      <AppHeader
        icon={<LayoutDashboard size={20} />}
        title="Dashboard"
      />
      <div className="flex flex-wrap gap-4">
        {[
          ["Total Commands Processed", total_commands_processed],
          ["Dataset Bytes", dataset_bytes],
          ["Connected Clients", connected_clients],
          ["Keys Count", keys_count],
          ["Bytes per Key", bytes_per_key],
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
