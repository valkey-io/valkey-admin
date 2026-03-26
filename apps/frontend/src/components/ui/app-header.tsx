import { useNavigate, useParams } from "react-router"
import { useSelector } from "react-redux"
import { useState, useRef, useEffect, useMemo, type ReactNode } from "react"
import { CircleChevronDown, CircleChevronUp, Dot, CornerDownRight } from "lucide-react"
import { CONNECTED } from "@common/src/constants.ts"
import { Badge } from "./badge"
import { Typography } from "./typography"
import { SearchInput } from "./search-input"
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
  const [nodeSearch, setNodeSearch] = useState("")
  const dropdownRef = useRef<HTMLDivElement>(null)
  const badgeRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { id, clusterId } = useParams<{ id: string; clusterId: string }>()
  const connectionDetails = useSelector(selectConnectionDetails(id!))
  const { host, port, username, alias } = connectionDetails ?? {}
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
    setNodeSearch("")
  }

  const toggleDropdown = () => {
    if (!effectiveConnected) return
    const next = !isOpen
    setIsOpen(next)
    if (!next) setNodeSearch("")
  }

  // Filter cluster nodes by search query
  const filteredNodes = useMemo(() => {
    if (!clusterData?.clusterNodes) return []
    const entries = Object.entries(clusterData.clusterNodes)
    if (!nodeSearch) return entries
    const q = nodeSearch.toLowerCase()
    return entries.filter(([key, primary]) =>
      key.includes(q) ||
      `${primary.host}:${primary.port}`.toLowerCase().includes(q),
    )
  }, [clusterData?.clusterNodes, nodeSearch])

  // Auto-focus search when dropdown opens
  useEffect(() => {
    if (isOpen) setTimeout(() => searchRef.current?.focus(), 0)
  }, [isOpen])

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
              onClick={toggleDropdown}
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
              <div className="w-80 border bg-gray-50 dark:bg-gray-800 text-sm dark:border-tw-dark-border
                rounded z-100 absolute top-10 right-0 flex flex-col" ref={dropdownRef}>
                <div className="p-2 border-b dark:border-tw-dark-border">
                  <SearchInput
                    onChange={(e) => setNodeSearch(e.target.value)}
                    onClear={() => setNodeSearch("")}
                    placeholder="Filter nodes..."
                    ref={searchRef}
                    value={nodeSearch}
                  />
                </div>
                <ul className="overflow-y-auto h-72 p-2 space-y-1">
                  {filteredNodes.length === 0 ? (
                    <li className="text-center py-4 text-muted-foreground">No nodes match "{nodeSearch}"</li>
                  ) : (
                    filteredNodes.map(([primaryKey, primary]) => {
                      const isCurrentNode = primaryKey === id
                      return (
                        <li className="flex flex-col gap-0.5" key={primaryKey}>
                          <button
                            className={cn(
                              "flex items-center w-full rounded px-1 cursor-pointer hover:bg-primary/20",
                              isCurrentNode && "bg-primary/10",
                            )}
                            onClick={() => handleNavigate(primaryKey)}
                          >
                            <Dot className={isCurrentNode ? "text-green-500" : "text-primary"} size={32} />
                            <Typography className="truncate" variant="bodySm">
                              {`${primary.host}:${primary.port}`}
                            </Typography>
                          </button>
                          {primary.replicas?.map((replica) => (
                            <div className="flex items-center ml-6" key={replica.id}>
                              <CornerDownRight className="text-tw-dark-border shrink-0" size={14} />
                              <Dot className="text-primary shrink-0" size={20} />
                              <Typography className="truncate" variant="caption">
                                {replica.host}:{replica.port}
                              </Typography>
                            </div>
                          ))}
                        </li>
                      )
                    })
                  )}
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
