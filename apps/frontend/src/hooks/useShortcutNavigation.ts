import { useEffect } from "react"
import { useNavigate, useParams } from "react-router"
import useIsConnected from "./useIsConnected"

export const useShortcutNavigation = () => {
  const navigate = useNavigate()
  const { id, clusterId } = useParams()
  const isConnected = useIsConnected()

  useEffect(() => {
    // only works when running in Electron
    if (!window.electronNavigation) return

    const handleNavigate = (route: string) => {
      const routes: Record<string, string> = isConnected
        ? {
          connect: clusterId ? `/${clusterId}/${id}/connect` : `/${id}/connect`,
          dashboard: clusterId ? `/${clusterId}/${id}/dashboard` : `/${id}/dashboard`,
          browse: clusterId ? `/${clusterId}/${id}/browse` : `/${id}/browse`,
          monitoring: clusterId ? `/${clusterId}/${id}/monitoring` : `/${id}/monitoring`,
          sendcommand: clusterId ? `/${clusterId}/${id}/sendcommand` : `/${id}/sendcommand`,
          "cluster-topology": clusterId ? `/${clusterId}/${id}/cluster-topology` : "",
          settings: clusterId ? `/${clusterId}/${id}/settings` : `/${id}/settings`,
          learnmore: clusterId ? `/${clusterId}/${id}/learnmore` : `/${id}/learnmore`,
        }
        : {
          connect: "/connect",
          settings: "/settings",
          learnmore: "/learnmore",
        }

      const targetRoute = routes[route]
      if (targetRoute) {
        navigate(targetRoute)
      }
    }

    window.electronNavigation.onNavigate(handleNavigate)
  }, [navigate, id, clusterId, isConnected])
}
