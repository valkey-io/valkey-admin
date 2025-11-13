import { useState } from "react"
import { useSelector } from "react-redux"
import { HousePlug } from "lucide-react"
import * as R from "ramda"
import ConnectionForm from "../ui/connection-form.tsx"
import EditForm from "../ui/edit-form.tsx"
import type { ConnectionState } from "@/state/valkey-features/connection/connectionSlice.ts"
import { selectConnections } from "@/state/valkey-features/connection/connectionSelectors.ts"
import { ConnectionEntry } from "@/components/connection/ConnectionEntry.tsx"
import { ClusterConnectionGroup } from "@/components/connection/ClusterConnectionGroup.tsx"

export function Connection() {
  const [showConnectionForm, setShowConnectionForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const connections = useSelector(selectConnections)

  // grouping connections
  const { clusterGroups, standaloneConnections } = Object.entries(connections).reduce<{
    clusterGroups: Record<string, Array<{ connectionId: string; connection: ConnectionState }>>
    standaloneConnections: Array<{ connectionId: string; connection: ConnectionState }>
  }>(
    (acc, [connectionId, connection]) => {
      const clusterId = connection.connectionDetails.clusterId
      if (clusterId)
        (acc.clusterGroups[clusterId] ??= []).push({ connectionId, connection })
      else
        acc.standaloneConnections.push({ connectionId, connection })
      return acc
    },
    { clusterGroups: {}, standaloneConnections: [] },
  )

  const hasClusterGroups = Object.keys(clusterGroups).length > 0
  const hasStandaloneConnections = standaloneConnections.length > 0

  const connectButton = () =>
    <button
      className="bg-tw-primary text-white px-2 rounded text-sm font-light py-1 cursor-pointer"
      onClick={() => setShowConnectionForm(!showConnectionForm)}
    >
      + Add Connection
    </button>

  return (
    <div className="p-4 relative min-h-screen flex flex-col">
      {/* top header */}
      <div className="flex items-center justify-between h-10">
        <h1 className="text-xl font-bold flex items-center gap-2 text-gray-700 dark:text-white">
          <HousePlug /> Connections
        </h1>
        {R.isNotEmpty(connections) && connectButton()}
      </div>

      {showConnectionForm && <ConnectionForm onClose={() => setShowConnectionForm(false)} />}
      {showEditForm && <EditForm onClose={() => setShowEditForm(false)} />}

      {R.isEmpty(connections) ? (
        <div className="flex-1 flex items-center justify-center flex-col gap-4">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-gray-700 dark:text-white mb-2">
              You Have No Connections!
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Click "+ Add Connection" button to connect to a Valkey instance or cluster.
            </p>
            {connectButton()}
          </div>
        </div>
      ) : (
        <div className="flex-1 mt-8">
          {/* for clusters */}
          {hasClusterGroups && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 px-1">
                Clusters
              </h2>
              <div>
                {Object.entries(clusterGroups).map(([clusterId, clusterConnections]) => (
                  <ClusterConnectionGroup
                    clusterId={clusterId}
                    connections={clusterConnections}
                    key={clusterId}
                  />
                ))}
              </div>
            </div>
          )}

          {/* for standalone instances */}
          {hasStandaloneConnections && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 px-1">
                Instances
              </h2>
              <div>
                {standaloneConnections.map(({ connectionId, connection }) => (
                  <ConnectionEntry
                    connection={connection}
                    connectionId={connectionId}
                    key={connectionId}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
