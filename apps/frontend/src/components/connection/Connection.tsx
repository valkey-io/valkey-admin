import { useState } from "react"
import { useSelector } from "react-redux"
import { HousePlug } from "lucide-react"
import ConnectionForm from "../ui/connection-form.tsx"
import EditForm from "../ui/edit-form.tsx"
import RouteContainer from "../ui/route-container.tsx"
import { Button } from "../ui/button.tsx"
import { EmptyState } from "../ui/empty-state.tsx"
import { SectionHeader } from "../ui/section-header.tsx"
import type { ConnectionState } from "@/state/valkey-features/connection/connectionSlice.ts"
import { selectConnections } from "@/state/valkey-features/connection/connectionSelectors.ts"
import { ConnectionEntry } from "@/components/connection/ConnectionEntry.tsx"
import { ClusterConnectionGroup } from "@/components/connection/ClusterConnectionGroup.tsx"

export function Connection() {
  const [showConnectionForm, setShowConnectionForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editingConnectionId, setEditingConnectionId] = useState<string | undefined>(undefined)
  const connections = useSelector(selectConnections)

  const handleEditConnection = (connectionId: string) => {
    setEditingConnectionId(connectionId)
    setShowEditForm(true)
  }

  const handleCloseEditForm = () => {
    setShowEditForm(false)
    setEditingConnectionId(undefined)
  }

  // filter based on connections that connected at least once (have history) then sort by history length
  const connectionsWithHistory = Object.entries(connections)
    .filter(([, connection]) => (connection.connectionHistory ?? []).length > 0)
    .sort(([, a], [, b]) =>
      (b.connectionHistory?.length ?? 0) - (a.connectionHistory?.length ?? 0),
    )

  // grouping connections
  const { clusterGroups, standaloneConnections } = connectionsWithHistory.reduce<{
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
  const hasConnectionsWithHistory = connectionsWithHistory.length > 0

  return (
    <RouteContainer title="connection">
      {/* top header */}
      <div className="flex items-center justify-between h-10">
        <h1 className="text-xl font-bold flex items-center gap-2 text-gray-700 dark:text-white">
          <HousePlug /> Connections
        </h1>
        {hasConnectionsWithHistory && (
          <Button
            onClick={() => setShowConnectionForm(!showConnectionForm)}
            size="sm"
            variant={"default"}
          >
            + Add Connection
          </Button>
        )}
      </div>

      {showConnectionForm && <ConnectionForm onClose={() => setShowConnectionForm(false)} />}
      {showEditForm && <EditForm connectionId={editingConnectionId} onClose={handleCloseEditForm} />}

      {!hasConnectionsWithHistory ? (
        <EmptyState
          action={
            <Button
              onClick={() => setShowConnectionForm(!showConnectionForm)}
              size="sm"
              variant={"default"}
            >
              + Add Connection
            </Button>
          }
          description="Click '+ Add Connection' button to connect to a Valkey instance or cluster."
          title="You Have No Connections!"
        />
      ) : (
        <div className="flex-1">
          {/* for clusters */}
          {hasClusterGroups && (
            <div className="mb-8">
              <SectionHeader>Clusters</SectionHeader>
              <div>
                {Object.entries(clusterGroups).map(([clusterId, clusterConnections]) => (
                  <ClusterConnectionGroup
                    clusterId={clusterId}
                    connections={clusterConnections}
                    key={clusterId}
                    onEdit={handleEditConnection}
                  />
                ))}
              </div>
            </div>
          )}

          {/* for standalone instances */}
          {hasStandaloneConnections && (
            <div>
              <SectionHeader>Instances</SectionHeader>
              <div>
                {standaloneConnections.map(({ connectionId, connection }) => (
                  <ConnectionEntry
                    connection={connection}
                    connectionId={connectionId}
                    key={connectionId}
                    onEdit={handleEditConnection}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </RouteContainer>
  )
}
