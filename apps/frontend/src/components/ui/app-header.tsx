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
  const navigate = useNavigate()
  const { id, clusterId } = useParams<{ id: string; clusterId: string }>()
  const { host, port, username, alias } = useSelector(selectConnectionDetails(id!))
  const clusterData = useSelector(selectCluster(clusterId!))
  const ToggleIcon = isOpen ? CircleChevronUp : CircleChevronDown

  const connectionStatus = useSelector((state: RootState) =>
    state.valkeyConnection?.connections?.[id!]?.status,
  )
  const isConnected = connectionStatus === CONNECTED

  const allConnections = useSelector((state: RootState) =>
    state.valkeyConnection?.connections,
  )

  const handleNavigate = () => {
    navigate(`/${clusterId}/${id}/dashboard`)
    setIsOpen(false)
  }

  // for closing the dropdown when we click anywhere in screen
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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
              className="h-5 w-50 px-2 py-4 flex items-center gap-2 justify-between cursor-pointer"
              variant="default"
            >
              <div className="flex flex-col gap-1">
                <Typography
                  className="flex items-center"
                  variant="bodySm"
                >
                  <Dot className={isConnected ? "text-green-500" : "text-gray-400"} size={45} />
                  {id}
                </Typography>
              </div>
              <button disabled={!isConnected} onClick={() => isConnected && setIsOpen(!isOpen)}>
                <ToggleIcon
                  className={isConnected
                    ? "text-tw-primary cursor-pointer hover:text-tw-primary/80"
                    : "text-gray-400 cursor-not-allowed"
                  }
                  size={18}
                />
              </button>
            </Badge>
            {isOpen && (
              <div className="p-4 w-50 py-3 border bg-gray-50 dark:bg-gray-800 text-sm dark:border-tw-dark-border
                rounded z-10 absolute top-10 right-0" ref={dropdownRef}>
                <ul className="space-y-2">
                  {Object.entries(clusterData.clusterNodes).map(([primaryKey, primary]) => {
                    const nodeIsConnected = allConnections?.[primaryKey]?.status === CONNECTED

                    return (
                      <li className="flex flex-col gap-1" key={primaryKey}>
                        <button className="flex items-center cursor-pointer hover:bg-tw-primary/20"
                          disabled={!nodeIsConnected}
                          onClick={() => handleNavigate()}>
                          <Dot className={nodeIsConnected ? "text-green-500" : "text-gray-400"} size={45} />
                          <Typography variant="bodySm">
                            {`${primary.host}:${primary.port}`}
                          </Typography>
                        </button>
                        {primary.replicas?.map((replica) => (
                          <div className="flex items-center ml-4" key={replica.id}>
                            <CornerDownRight className="text-tw-dark-border" size={20} />
                            <button className="flex items-center">
                              <Dot className="text-tw-primary" size={24} />
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
