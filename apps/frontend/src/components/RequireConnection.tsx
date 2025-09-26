import { Navigate, Outlet } from "react-router"
import useIsConnected from "@/hooks/useIsConnected.ts"

const RequireConnection = () => {
  const isConnected = useIsConnected()

  return isConnected ? <Outlet/> : <Navigate replace to="/connect"/>
}

export default RequireConnection
