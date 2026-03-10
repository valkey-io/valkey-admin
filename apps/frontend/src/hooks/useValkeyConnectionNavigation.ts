import { useEffect, useRef } from "react"
import { useSelector } from "react-redux"
import { useLocation, useNavigate, useParams } from "react-router"
import { CONNECTING, ERROR } from "@common/src/constants"
import type { RootState } from "@/store"

// TO DO: replace in the EPIC
export function useValkeyConnectionNavigation() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()

  const connection = useSelector((state: RootState) =>
    id ? state.valkeyConnection?.connections?.[id!] : null,
  )

  const previousStatus = useRef(connection?.status)

  useEffect(() => {
    if (!id || !connection) {
      return
    }

    const currentStatus = connection.status
    const isRetrying = connection.reconnect?.isRetrying
    const isOnReconnectPage = location.pathname.includes("/valkey-reconnect")

    if (isOnReconnectPage || location.pathname === "/connect" || location.pathname === "/settings") {
      previousStatus.current = currentStatus
      return
    }

    // if we should navigate to reconnect page
    const shouldNavigate =
      (currentStatus === CONNECTING && isRetrying) ||
          (currentStatus === ERROR && isRetrying) ||
          (currentStatus === ERROR && connection.reconnect && !isRetrying)

    if (shouldNavigate && !isOnReconnectPage) {
      sessionStorage.setItem(`valkey-previous-${id}`, location.pathname)
      const reconnectPath = `/${id}/valkey-reconnect`
      navigate(reconnectPath, { replace: true })
    }

    previousStatus.current = currentStatus
  }, [
    connection,
    connection?.status,
    connection?.reconnect?.isRetrying,
    location.pathname,
    navigate,
    id,
  ])
}
