import { Dot, LayoutDashboard, Terminal, PowerIcon } from "lucide-react"
import { useNavigate } from "react-router"
import { useSelector } from "react-redux"
import { CONNECTED } from "@common/src/constants.ts"
import { TooltipProvider } from "@radix-ui/react-tooltip"
import { Card } from "./card"
import { CustomTooltip } from "./custom-tooltip"
import type { RootState } from "@/store.ts"
import type { MasterNode, ParsedNodeInfo } from "@/state/valkey-features/cluster/clusterSlice"
import { connectPending, type ConnectionDetails } from "@/state/valkey-features/connection/connectionSlice.ts"
import { useAppDispatch } from "@/hooks/hooks"

interface ClusterNodeProps {
  primaryKey: string
  primary: MasterNode
  primaryData: ParsedNodeInfo
  allNodeData: Record<string, ParsedNodeInfo>
  clusterId: string
}

export default function ClusterNode({ primaryKey, primary, primaryData, allNodeData, clusterId }: ClusterNodeProps) {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()

  // to check if cluster node is connected
  const connectionId = primaryKey
  const connectionStatus = useSelector((state: RootState) =>
    state.valkeyConnection?.connections?.[connectionId]?.status,
  )
  const isConnected = connectionStatus === CONNECTED

  const formatRole = (role: string | null) => {
    if (!role) return "UNKNOWN"
    const normalized = role.toLowerCase()
    if (normalized === "master") return "PRIMARY"
    if (normalized === "slave") return "REPLICA"
    return role.toUpperCase()
  }

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
        //TODO: Add handling and UI for uploading cert
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

  return (
    <Card className="dark:bg-gray-800">
      {/* for primary */}
      <TooltipProvider>
        <div className="flex items-center justify-between">
          <span className="font-bold">{formatRole(primaryData?.role)}</span>
          <CustomTooltip content={`${isConnected ? "Connected" : "Not Connected"}`}>
            <PowerIcon
              className={`${isConnected ? "text-green-500 bg-green-100" : "text-gray-400 cursor-pointer bg-gray-100 hover:text-gray-600"} rounded-full p-0.5`}
              onClick={handleNodeConnect}
              size={18}
            />
          </CustomTooltip>
        </div>
      </TooltipProvider>
      <div className="flex flex-col text-xs text-tw-dark-border"><span>{primaryData?.server_name}</span><span>{`${primary.host}:${primary.port}`}</span></div>
      <div className="text-xs space-y-1.5">
        <div className="flex justify-between">
          <span className="text-tw-dark-border">Memory:</span>
          <span>{primaryData?.used_memory_human ?? "N/A"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-tw-dark-border">CPU (sys):</span>
          <span>{primaryData?.used_cpu_sys ?? "N/A"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-tw-dark-border">Commands:</span>
          <span>{primaryData?.total_commands_processed ?? "N/A"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-tw-dark-border">Clients:</span>
          <span>{primaryData?.connected_clients ?? "N/A"}</span>
        </div>
      </div>
      <div className="border-b mt-0"></div>
      {/* for replicas */}
      {primary.replicas.length > 0 && (
        <div className="mt-0">
          <span className="text-xs text-tw-dark-border">REPLICAS ({primary.replicas.length})</span>
          {primary.replicas.map((replica) => (
            <div className="bg-tw-primary/10 rounded-sm p-2 text-xs text-tw-dark-border" key={replica.id}>
              <div className="flex items-center justify-between space-y-1">
                <div className="">
                  <span>{`${replica.host}:${replica.port}`}</span>
                  <div className="flex gap-4">
                    <span>Mem: {allNodeData[`${replica.host}:${replica.port}`]?.used_memory_human}</span>
                    <span>Clients: {allNodeData[`${replica.host}:${replica.port}`]?.connected_clients}</span>
                  </div>
                </div>
                <Dot className="text-tw-primary" size={30} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* primary buttons */}
      <div className="mt-2 flex gap-2 text-xs items-center justify-center">
        <button className={`w-1/2 flex items-center justify-center gap-1.5 border px-2 py-1 rounded
         ${isConnected ? "cursor-pointer hover:bg-tw-primary hover:text-white" : "cursor-not-allowed opacity-50"}`}
        disabled={!isConnected}
        onClick={() => { navigate(`/${clusterId}/${connectionId}/dashboard`) }}><LayoutDashboard size={12} /> Dashboard</button>
        <button className={`w-1/2 flex items-center justify-center gap-1.5 border px-2 py-1 rounded
         ${isConnected ? "cursor-pointer hover:bg-tw-primary hover:text-white" : "cursor-not-allowed opacity-50"}`}
        disabled={!isConnected}
        onClick={() => { navigate(`/${clusterId}/${connectionId}/sendcommand`) }}><Terminal size={12} /> Command</button>
      </div>
    </Card>
  )
}
