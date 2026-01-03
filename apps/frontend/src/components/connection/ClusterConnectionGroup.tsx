import { useState, useRef, useEffect } from "react"
import { ChevronDown, ChevronRight, Network, CircleChevronRight, PencilIcon, CheckIcon, XIcon } from "lucide-react"
import { CONNECTED } from "@common/src/constants.ts"
import { ConnectionEntry } from "./ConnectionEntry.tsx"
import { updateConnectionDetails, type ConnectionState } from "@/state/valkey-features/connection/connectionSlice"
import { useAppDispatch } from "@/hooks/hooks.ts"
import { Button } from "@/components/ui/button.tsx"
import history from "@/history.ts"

interface ClusterConnectionGroupProps {
  clusterId: string
  connections: Array<{ connectionId: string; connection: ConnectionState }>
  onEdit?: (connectionId: string) => void
}

export const ClusterConnectionGroup = ({ clusterId, connections, onEdit }: ClusterConnectionGroupProps) => {
  const dispatch = useAppDispatch()
  const [isOpen, setIsOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedAlias, setEditedAlias] = useState("")
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  const connected = connections.filter(({ connection }) => connection.status === CONNECTED)
  const connectedCount = connected.length
  const hasConnectedInstance = connectedCount > 0
  const firstConnectedConnection = connected[0]

  // capture cluster alias from the first node's alias
  const firstNode = connections[0]
  const firstNodeAlias = firstNode?.connection.connectionDetails.alias

  const handleOpenCluster = () => {
    if (firstConnectedConnection) {
      history.navigate(`/${clusterId}/${firstConnectedConnection.connectionId}/cluster-topology`)
    }
  }

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

  return (
    <div
      className="mb-3 border dark:border-tw-dark-border rounded bg-white dark:bg-tw-dark-primary"
      ref={dropdownRef}
    >
      {/* cluster head */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <button
              className="p-1 rounded hover:bg-tw-primary/20"
              onClick={() => setIsOpen(!isOpen)}
            >
              {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
            </button>

            <div className="flex items-center gap-2 flex-1">
              <div className="p-2 bg-tw-primary/10 dark:bg-tw-primary/20 rounded">
                <Network className="text-tw-primary" size={18} />
              </div>
              <div className="flex-1">
                {isEditing ? (
                  <div className="flex items-center gap-2 mb-1">
                    <input
                      autoFocus
                      className="px-2 py-1 text-sm border dark:border-tw-dark-border rounded
                        bg-white dark:bg-tw-primary/20 focus:outline-none focus:ring-2 focus:ring-tw-primary"
                      onChange={(e) => setEditedAlias(e.target.value)}
                      placeholder={clusterId}
                      type="text"
                      value={editedAlias}
                    />
                    <Button onClick={handleSave} size="sm" title="Save" variant="secondary">
                      <CheckIcon className="text-tw-primary" size={16} />
                    </Button>
                    <Button onClick={handleCancel} size="sm" title="Cancel" variant="destructiveGhost">
                      <XIcon className="" size={16} />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm text-gray-900 dark:text-white">{firstNodeAlias ? firstNodeAlias : clusterId}</h3>
                    <Button className="h-6 w-6 p-0" onClick={handleEdit} size="sm" variant="ghost">
                      <PencilIcon size={14} />
                    </Button>
                    {hasConnectedInstance && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-teal-100 dark:bg-teal-900/30 text-teal-700
                       dark:text-teal-400 rounded-full">
                        {connectedCount} connected
                      </span>
                    )}
                  </div>
                )}
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {connections.length} instance{connections.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center text-sm gap-2">
            {hasConnectedInstance && (
              <button
                className="flex items-center gap-1 p-2 rounded-md text-tw-primary border border-tw-primary/70
                 hover:bg-tw-primary hover:text-white"
                onClick={handleOpenCluster}
              >
                <CircleChevronRight size={16} />
                Open Topology
              </button>
            )}
          </div>
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
