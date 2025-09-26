import { useSelector } from "react-redux"
import { useParams } from "react-router"
import { CONNECTED } from "@common/src/constants.ts"
import { selectStatus } from "@/state/valkey-features/connection/connectionSelectors.ts"

const useIsConnected = (): boolean => {
  const { id } = useParams<{ id: string }>()
  return useSelector(selectStatus(id!)) === CONNECTED
}

export default useIsConnected
