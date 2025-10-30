import { useEffect, useRef } from "react"
import { useSelector } from "react-redux"
import { useLocation, useNavigate } from "react-router"
import { CONNECTED, CONNECTING, ERROR } from "@common/src/constants"
import type { RootState } from "@/store"

export function useWebSocketNavigation() {
  const navigate = useNavigate()
  const location = useLocation()
  const wsConnection = useSelector((state: RootState) => state.websocket)
  const previousStatus = useRef(wsConnection.status)

  useEffect(() => {
    const currentStatus = wsConnection.status
    const wasConnected = previousStatus.current === CONNECTED
    const isNowDisconnected = currentStatus === CONNECTING && wsConnection.reconnect.isRetrying
    const isReconnecting = location.pathname === "/reconnect"

    if (isReconnecting || location.pathname === "/connect") {
      previousStatus.current = currentStatus
      return
    }

    if (wasConnected && isNowDisconnected) {
      // store location and navigate to reconnecting
      sessionStorage.setItem("previousLocation", location.pathname)
      navigate("/reconnect", { replace: true })
    }

    if (currentStatus === ERROR && !wsConnection.reconnect.isRetrying && !isReconnecting) {
      sessionStorage.setItem("previousLocation", location.pathname)
      navigate("/reconnect", { replace: true })
    }

    previousStatus.current = currentStatus
  }, [wsConnection.status, wsConnection.reconnect.isRetrying, location.pathname, navigate])
}
