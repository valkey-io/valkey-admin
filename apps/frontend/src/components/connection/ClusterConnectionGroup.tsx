import * as R from "ramda"
import { useState, useMemo, useEffect } from "react"
import {
  ChevronDown,
  ChevronRight,
  Network,
  PencilIcon,
  CheckIcon,
  XIcon,
  Plug
} from "lucide-react"
import { Link } from "react-router"
import { CONNECTED } from "@common/src/constants.ts"
import { ConnectionEntry } from "./ConnectionEntry.tsx"
import { Input } from "../ui/input.tsx"
import {
  updateConnectionDetails,
  type ConnectionState,
  connectPending
} from "@/state/valkey-features/connection/connectionSlice"
import { useAppDispatch } from "@/hooks/hooks.ts"
import { Button } from "@/components/ui/button.tsx"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip.tsx"

interface ClusterConnectionGroupProps {
  clusterId: string
  connections: Array<{ connectionId: string; connection: ConnectionState }>
  onEdit?: (connectionId: string) => void
}

// we'll use this function to find the most recent cluster node opened — to reconnect without exploding the dropdown
const getLatestTimestamp = R.pipe(
  R.pathOr([], ["connection", "connectionHistory"]),
  R.pluck("timestamp") as unknown as (xs: Array<{ timestamp: number }>) => number[],
  R.reduce(R.max, -Infinity),
)

// storage key for persisting open/closed state of cluster groups
const getStorageKey = (clusterId: string) => `cluster-group-open-${clusterId}`

export const ClusterConnectionGroup = ({ clusterId, connections, onEdit }: ClusterConnectionGroupProps) => {
  const dispatch = useAppDispatch()
  const [isOpen, setIsOpen] = useState(() => {
    const stored = localStorage.getItem(getStorageKey(clusterId))
    return stored ? JSON.parse(stored) : false
  })
  const [isEditing, setIsEditing] = useState(false)
  const [editedAlias, setEditedAlias] = useState("")

  useEffect(() => {
    // store the open/closed state of the cluster group in localStorage
    // we want to persist this state when connection page reloads or user navigates away
    localStorage.setItem(getStorageKey(clusterId), JSON.stringify(isOpen))
  }, [isOpen, clusterId])

  const connected = connections.filter(({ connection }) => connection.status === CONNECTED)
  const connectedCount = connected.length
  const hasConnectedInstance = connectedCount > 0
  const firstConnectedConnection = connected[0]

  // capture cluster alias from the first node's alias
  const firstNode = connections[0]
  const firstNodeAlias = firstNode?.connection.connectionDetails.alias

  const lastOpenedNode = useMemo(
    () => R.reduce(R.maxBy(getLatestTimestamp), null, connections),
    [connections],
  )

  const handleEdit = () => {
    setEditedAlias(firstNodeAlias || "")
    setIsEditing(true)
  }

  const handleSave = () => {
    if (firstNode) {
      dispatch(updateConnectionDetails({
        connectionId: firstNode.connectionId,
        alias: editedAlias.trim() || undefined,
      }))
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditedAlias(firstNodeAlias || "")
    setIsEditing(false)
  }

  const handleConnectLatest = () => lastOpenedNode && dispatch(connectPending({
    connectionDetails: lastOpenedNode.connection.connectionDetails,
    connectionId: lastOpenedNode.connectionId,
    preservedHistory: lastOpenedNode.connection.connectionHistory,
  }))

  return (
    <div
      className="mb-3 border border-input rounded-md shadow-xs bg-white dark:bg-tw-dark-primary"
    >
      {/* cluster head */}
      <div className="flex items-center justify-between">
        <div className="flex items-center flex-1">
          <Button
            className="ml-2"
            onClick={() => setIsOpen(!isOpen)}
            variant={"ghost"}
          >
            {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </Button>

          <div className="flex items-center gap-2 flex-1 p-2">
            <div className="p-2 bg-tw-primary/10 dark:bg-tw-primary/20 rounded">
              <Network className="text-tw-primary" size={18} />
            </div>
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <Input
                    autoFocus
                    onChange={(e) => setEditedAlias(e.target.value)}
                    placeholder={clusterId}
                    style={{ width: `${Math.max(Math.min((editedAlias || clusterId).length * 8 + 20, 250), 100)}px` }}
                    value={editedAlias}
                  />
                  <Button onClick={handleSave} size="sm" title="Save" variant="secondary">
                    <CheckIcon className="text-tw-primary" size={16} />
                    Save
                  </Button>
                  <Button onClick={handleCancel} size="sm" title="Cancel" variant="ghost">
                    <XIcon className="" size={16} />
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {hasConnectedInstance ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="min-w-0 flex-1 overflow-hidden max-w-[200px]">
                          <Link
                            className="block font-mono text-sm text-blue-600 dark:text-blue-400 hover:underline"
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              display: "block",
                            }}
                            title={firstNodeAlias || clusterId}
                            to={`/${clusterId}/${firstConnectedConnection.connectionId}/cluster-topology`}
                          >
                            {firstNodeAlias || clusterId}
                          </Link>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        Click to view cluster topology
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <div className="min-w-0 flex-1 overflow-hidden max-w-[200px]">
                      <h3
                        className="
                          font-mono text-sm text-gray-900 dark:text-white
                          cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap"
                        onClick={() => setIsOpen(!isOpen)}
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          display: "block",
                        }}
                        title={firstNodeAlias || clusterId}
                      >
                        {firstNodeAlias || clusterId}
                      </h3>
                    </div>
                  )}
                  <Button
                    className="group flex items-center gap-1 flex-shrink-0"
                    onClick={handleEdit}
                    size="sm"
                    variant="ghost"
                  >
                    <PencilIcon size={16} />
                    <span
                      className="
                        overflow-hidden whitespace-nowrap
                        opacity-0 translate-x-[-4px] max-w-0
                        transition-[opacity,transform,max-width] duration-200 ease-out
                        group-hover:opacity-100 group-hover:translate-x-0 group-hover:max-w-[60px]"
                    >
                      Rename
                    </span>
                  </Button>
                </div>
              )}
              <div className="text-sm pl-2 text-gray-500 dark:text-gray-400 font-mono truncate" title={`${connections.length} instance${connections.length !== 1 ? "s" : ""}${hasConnectedInstance ? ` - ${connectedCount} connected` : ""}`}>
                {connections.length} instance{connections.length !== 1 ? "s" : ""}
                {hasConnectedInstance && (
                  <span className="ml-2 px-2 py-0.5 text-sm bg-teal-100 dark:bg-teal-900/30 text-teal-700
                   dark:text-teal-400 rounded">
                    {connectedCount} connected
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center text-sm gap-2">
          {
            !hasConnectedInstance && lastOpenedNode ? (
              <Button
                className="flex items-center gap-1 p-2 mr-4 rounded-md"
                onClick={handleConnectLatest}
                variant="secondary"
              >
                <Plug size={16} />
                Connect
              </Button>
            ) : null
          }
        </div>
      </div>

      {isOpen && (
        <div className="border-t dark:border-tw-dark-border">
          <div className="p-2 space-y-1">
            {connections.map(({ connectionId, connection }) => (
              <ConnectionEntry
                clusterId={clusterId}
                connection={connection}
                connectionId={connectionId}
                hideOpenButton={true}
                isNested={true}
                key={connectionId}
                onEdit={onEdit}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
