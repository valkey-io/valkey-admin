import { useState, useRef, useEffect } from "react"
import { ChevronDown, ChevronRight, Network, CircleChevronRight } from "lucide-react"
import { CONNECTED } from "@common/src/constants.ts"
import { ConnectionEntry } from "./ConnectionEntry.tsx"
import type { ConnectionState } from "@/state/valkey-features/connection/connectionSlice"
import history from "@/history.ts"

interface ClusterConnectionGroupProps {
  clusterId: string
  connections: Array<{ connectionId: string; connection: ConnectionState }>
}

export const ClusterConnectionGroup = ({ clusterId, connections }: ClusterConnectionGroupProps) => {
  const [isOpen, setIsOpen] = useState(false)
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

  const handleOpenCluster = () => {
    if (firstConnectedConnection) {
      history.navigate(`/${clusterId}/${firstConnectedConnection.connectionId}/cluster-topology`)
    }
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

            <div className="flex items-center gap-2">
              <div className="p-2 bg-tw-primary/10 dark:bg-tw-primary/20 rounded">
                <Network className="text-tw-primary" size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm text-gray-900 dark:text-white">{clusterId}</h3>
                  {hasConnectedInstance && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-teal-100 dark:bg-teal-900/30 text-teal-700
                     dark:text-teal-400 rounded-full">
                      {connectedCount} connected
                    </span>
                  )}
                </div>
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
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
