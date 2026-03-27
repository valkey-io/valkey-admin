import { useNavigate, useParams } from "react-router"
import { useSelector } from "react-redux"
import { useState, useRef, useEffect, type ReactNode } from "react"
import { CircleChevronDown, CircleChevronUp, Dot, CornerDownRight } from "lucide-react"
import { CONNECTED } from "@common/src/constants.ts"
import { Badge } from "./badge"
import { Typography } from "./typography"
import type { RootState } from "@/store.ts"
import { selectConnectionDetails } from "@/state/valkey-features/connection/connectionSelectors.ts"
import { selectCluster } from "@/state/valkey-features/cluster/clusterSelectors"
import { cn } from "@/lib/utils.ts"

type AppHeaderProps = {
  className?: string;
  title: string;
  icon: ReactNode;
};

function AppHeader({ title, icon, className }: AppHeaderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const badgeRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { id, clusterId } = useParams<{ id: string; clusterId: string }>()
  const connectionDetails = useSelector(selectConnectionDetails(id!)) ?? {} as Partial<ReturnType<ReturnType<typeof selectConnectionDetails>>>
  const { host, port, username, alias } = connectionDetails as { host?: string; port?: string; username?: string; alias?: string }
  const clusterData = useSelector(selectCluster(clusterId!))
  const ToggleIcon = isOpen ? CircleChevronUp : CircleChevronDown

  const connectionStatus = useSelector((state: RootState) =>
    state.valkeyConnection?.connections?.[id!]?.status,
  )
  const isConnected = connectionStatus === CONNECTED

  const allConnections = useSelector((state: RootState) =>
    state.valkeyConnection?.connections,
  )

  // For cluster mode, consider connected if any node in the cluster is connected
  const isClusterConnected = clusterId
    ? Object.values(allConnections ?? {}).some(
      (conn) => conn.connectionDetails.clusterId === clusterId && conn.status === CONNECTED,
    )
    : isConnected
  const effectiveConnected = isConnected || isClusterConnected

  const handleNavigate = (primaryKey: string) => {
    navigate(`/${clusterId}/${primaryKey}/dashboard`)
    setIsOpen(false)
  }

  // for closing the dropdown when we click anywhere in screen
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
        badgeRef.current && !badgeRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  return (
    <>
      {id && !clusterId ? (
        <div className={cn("flex h-10 mb-4 gap-2 items-center justify-between", className)}>
          <Typography className="flex items-center gap-2" variant="heading">
            {icon}
            {title}
          </Typography>

          <Badge variant="default">
            {alias ? alias : `${username}@${host}:${port}`}
          </Badge>
        </div>
      ) : (
        <div className={cn("flex h-10 mb-4 gap-2 items-center justify-between relative", className)}>
          <Typography className="flex items-center gap-2" variant="heading">
            {icon}
            {title}
          </Typography>
          <div>
            <Badge
              className={cn(
                "h-5 w-auto text-nowrap px-2 py-4 flex items-center gap-2 justify-between",
                effectiveConnected ? "cursor-pointer" : "cursor-not-allowed",
              )}
              onClick={() => effectiveConnected && setIsOpen(!isOpen)}
              ref={badgeRef}
              variant="default"
            >
              <div className="flex flex-col gap-1">
                <Typography
                  className="flex items-center"
                  variant="bodySm"
                >
                  <Dot className={effectiveConnected ? "text-green-500" : "text-gray-400"} size={45} />
                  {id}
                </Typography>
              </div>
              <ToggleIcon
                className={effectiveConnected
                  ? "text-primary hover:text-primary/80"
                  : "text-gray-400"
                }
                size={18}
              />
            </Badge>
            {isOpen && (
              <div className="p-4 w-auto text-nowrap py-3 border bg-gray-50 dark:bg-gray-800 text-sm dark:border-tw-dark-border
                rounded z-100 absolute top-10 right-0" ref={dropdownRef}>
                <ul className="space-y-2">
                  {Object.entries(clusterData.clusterNodes).map(([primaryKey, primary]) => {
                    const isCurrentNode = primaryKey === id

                    return (
                      <li className="flex flex-col gap-1" key={primaryKey}>
                        <button className={`flex items-center cursor-pointer hover:bg-primary/20 ${isCurrentNode ? "bg-primary/10" : ""}`}
                          onClick={() => handleNavigate(primaryKey)}>
                          <Dot className={isCurrentNode ? "text-green-500" : "text-primary"} size={45} />
                          <Typography variant="bodySm">
                            {`${primary.host}:${primary.port}`}
                          </Typography>
                        </button>
                        {primary.replicas?.map((replica) => (
                          <div className="flex items-center ml-4" key={replica.id}>
                            <CornerDownRight className="text-tw-dark-border" size={20} />
                            <button className="flex items-center">
                              <Dot className="text-primary" size={24} />
                              <Typography variant="caption">
                                {replica.host}:{replica.port}
                              </Typography>
                            </button>
                          </div>
                        ))}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

    </>
  )
}

export { AppHeader }
