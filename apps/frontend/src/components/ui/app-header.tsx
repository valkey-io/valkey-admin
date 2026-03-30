import { useNavigate, useParams } from "react-router"
import { useSelector } from "react-redux"
import { useState, useRef, useEffect, type ReactNode } from "react"
import { CircleChevronDown, CircleChevronUp, Dot, CornerDownRight, Search } from "lucide-react"
import { CONNECTED } from "@common/src/constants.ts"
import { Badge } from "./badge"
import { Input } from "./input"
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
  const [search, setSearch] = useState("")
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

  const handleNavigate = (primaryKey: string) => {
    navigate(`/${clusterId}/${primaryKey}/dashboard`)
    setIsOpen(false)
    setSearch("")
  }

  const filteredNodes = Object.entries(clusterData?.clusterNodes ?? {}).filter(([, primary]) => {
    const term = search.toLowerCase()
    return `${primary.host}:${primary.port}`.toLowerCase().includes(term)
  })

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
          <div ref={dropdownRef}>
            <Badge
              className={cn(
                "h-5 w-auto text-nowrap px-2 py-4 flex items-center gap-2 justify-between",
                isConnected ? "cursor-pointer" : "cursor-default",
              )}
              onClick={() => isConnected && setIsOpen(!isOpen)}
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
              <ToggleIcon
                aria-label="Toggle dropdown"
                className={isConnected
                  ? "text-primary hover:text-primary/80"
                  : "text-gray-400"
                }
                size={18}
              />
            </Badge>
            {isOpen && (
              <div className="p-4 w-auto text-nowrap py-3 border bg-gray-50 dark:bg-gray-800 text-sm dark:border-tw-dark-border
                rounded z-100 absolute top-10 right-0">
                <div className="relative mb-3">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                  <Input
                    autoFocus
                    className="pl-7 h-7 text-xs"
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by host or port"
                    value={search}
                  />
                </div>
                <ul className="space-y-2">
                  {filteredNodes.length === 0 && (
                    <li>
                      <Typography className="text-muted-foreground" variant="caption">No nodes found</Typography>
                    </li>
                  )}
                  {filteredNodes.map(([primaryKey, primary]) => {
                    const nodeIsConnected = allConnections?.[primaryKey]?.status === CONNECTED

                    return (
                      <li className="flex flex-col gap-1" key={primaryKey}>
                        <button className="flex items-center cursor-pointer hover:bg-primary/20"
                          disabled={!nodeIsConnected}
                          onClick={() => handleNavigate(primaryKey)}>
                          <Dot className={nodeIsConnected ? "text-green-500" : "text-gray-400"} size={45} />
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
