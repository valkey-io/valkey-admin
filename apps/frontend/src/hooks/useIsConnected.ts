import { useSelector } from "react-redux"
import { useParams } from "react-router"
import { CONNECTED } from "@common/src/constants.ts"
import { selectStatus, selectConnections } from "@/state/valkey-features/connection/connectionSelectors.ts"

const useIsConnected = (): boolean => {
  const { id, clusterId } = useParams<{ id: string; clusterId: string }>()
  const status = useSelector(selectStatus(id!))
  const connections = useSelector(selectConnections)

  // For cluster routes, consider connected if ANY node in the same cluster is connected
  if (clusterId && status !== CONNECTED) {
    return Object.values(connections).some(
      (conn) => conn.connectionDetails.clusterId === clusterId && conn.status === CONNECTED,
    )
  }

  return status === CONNECTED
}

export default useIsConnected
