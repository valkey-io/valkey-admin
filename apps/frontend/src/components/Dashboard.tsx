import { useSelector } from "react-redux";
import { selectData } from "@/state/valkey-features/info/infoSelectors.ts";
import { Card } from "./ui/card";
import { AppHeader } from "./ui/app-header";
import { LayoutDashboard } from "lucide-react";
import { selectConnectionDetails } from "@/state/valkey-features/connection/connectionSelectors";

export function Dashboard() {
  const {
    total_commands_processed,
    dataset_bytes,
    connected_clients,
    keys_count,
    bytes_per_key,
    server_name,
  } = useSelector(selectData);
  const connectionDetails = useSelector(selectConnectionDetails);
  return (
    <div className="p-4">
      <AppHeader
        title="Dashboard"
        icon={<LayoutDashboard size={20} />}
        servername={server_name || ""}
        port={connectionDetails.port}
      />
      <div className="flex flex-wrap gap-4">
        {[
          ["Total Commands Processed", total_commands_processed],
          ["Dataset Bytes", dataset_bytes],
          ["Connected Clients", connected_clients],
          ["Keys Count", keys_count],
          ["Bytes per Key", bytes_per_key],
        ].map(([label, value]) => (
          <Card key={label} className="flex flex-col p-4 w-[200px]">
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-lg text-muted-foreground">{label}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
