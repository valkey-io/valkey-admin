import { useSelector } from "react-redux"
import { useParams } from "react-router"
import { CONNECTED, CONNECTING, DISCONNECTED } from "@common/src/constants.ts"
import { selectStatus } from "@/state/valkey-features/connection/connectionSelectors.ts"

const useIsConnected = (): boolean => {
  const { id } = useParams<{ id: string }>()
  const status = useSelector(selectStatus(id!))
  // user will stay in the page if connected or disconnected
  return status === CONNECTED || status === DISCONNECTED || status === CONNECTING
}

export default useIsConnected
