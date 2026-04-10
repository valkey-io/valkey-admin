import { useState } from "react"
import { useSelector } from "react-redux"
import { HousePlug } from "lucide-react"
import { CONNECTED, CONNECTING, ERROR, MAX_CONNECTIONS } from "@common/src/constants.ts"
import ConnectionForm from "../ui/connection-form.tsx"
import EditForm from "../ui/edit-form.tsx"
import { PasswordPromptModal } from "../ui/password-prompt-modal.tsx"
import RouteContainer from "../ui/route-container.tsx"
import { Button } from "../ui/button.tsx"
import { EmptyState } from "../ui/empty-state.tsx"
import { SearchInput } from "../ui/search-input.tsx"
import { Typography } from "../ui/typography.tsx"
import { type ConnectionState, connectPending } from "@/state/valkey-features/connection/connectionSlice.ts"
import { selectConnections } from "@/state/valkey-features/connection/connectionSelectors.ts"
import { ConnectionEntry } from "@/components/connection/ConnectionEntry.tsx"
import { ClusterConnectionGroup } from "@/components/connection/ClusterConnectionGroup.tsx"
import { useAppDispatch } from "@/hooks/hooks.ts"
import { secureStorage } from "@/utils/secureStorage.ts"

const matchesSearch = (q: string, connection: ConnectionState) =>
  connection.searchableText.includes(q)

export function Connection() {
  const dispatch = useAppDispatch()
  const [showConnectionForm, setShowConnectionForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editingConnectionId, setEditingConnectionId] = useState<string | undefined>(undefined)
  const [searchQuery, setSearchQuery] = useState("")
  const [passwordPromptConnectionId, setPasswordPromptConnectionId] = useState<string | undefined>(undefined)
  const connections = useSelector(selectConnections)

  const handleEditConnection = (connectionId: string) => {
    setEditingConnectionId(connectionId)
    setShowEditForm(true)
  }

  const handleCloseEditForm = () => {
    setShowEditForm(false)
    setEditingConnectionId(undefined)
  }

  const handlePasswordRequired = (connectionId: string) => {
    setPasswordPromptConnectionId(connectionId)
  }

  const handlePasswordSubmit = async (password: string) => {
    if (!passwordPromptConnectionId) return
    const connection = connections[passwordPromptConnectionId]
    if (!connection) return
    const encryptedPassword = await secureStorage.encryptIfAvailable(password)
    dispatch(connectPending({
      connectionId: passwordPromptConnectionId,
      connectionDetails: { ...connection.connectionDetails, password: encryptedPassword },
      preservedHistory: connection.connectionHistory,
    }))
  }

  const promptedConnection = connections[passwordPromptConnectionId as string]
  const isPromptConnecting = promptedConnection?.status === CONNECTING
  const promptErrorMessage = promptedConnection?.status === ERROR
    ? promptedConnection.errorMessage ?? undefined
    : undefined
  const promptConnectionLabel = promptedConnection
    ? promptedConnection.connectionDetails.alias
      || `${promptedConnection.connectionDetails.host}:${promptedConnection.connectionDetails.port}`
    : ""

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

  const hasConnectionsWithHistory = connectionsWithHistory.length > 0

  // Filter by search query
  const q = searchQuery.toLowerCase()
  const filteredClusterGroups: typeof clusterGroups = {}
  if (q) {
    for (const [clusterId, conns] of Object.entries(clusterGroups)) {
      const matched = conns.filter(({ connection }) => matchesSearch(q, connection))
      if (matched.length > 0) filteredClusterGroups[clusterId] = matched
    }
  }
  const filteredStandaloneConnections = q
    ? standaloneConnections.filter(({ connection }) => matchesSearch(q, connection))
    : standaloneConnections

  const hasFilteredClusters = q ? Object.keys(filteredClusterGroups).length > 0 : Object.keys(clusterGroups).length > 0
  const hasFilteredStandalone = q ? filteredStandaloneConnections.length > 0 : standaloneConnections.length > 0
  const hasAnyResults = hasFilteredClusters || hasFilteredStandalone
  const displayClusterGroups = q ? filteredClusterGroups : clusterGroups

  const totalResults = filteredStandaloneConnections.length +
    Object.values(displayClusterGroups).reduce((sum, conns) => sum + conns.length, 0)
    
  const highlight = q && totalResults < MAX_CONNECTIONS ? q : ""

  return (
    <RouteContainer title="connection">
      {/* top header */}
      <div className="flex items-center justify-between h-10">
        <Typography className="flex items-center gap-2" variant="heading">
          <HousePlug size={20} /> Connections
        </Typography>
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
      <PasswordPromptModal
        connectionLabel={promptConnectionLabel}
        errorMessage={promptErrorMessage}
        isConnecting={isPromptConnecting}
        onClose={() => setPasswordPromptConnectionId(undefined)}
        onSubmit={handlePasswordSubmit}
        open={passwordPromptConnectionId !== undefined && promptedConnection?.status !== CONNECTED}
      />

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
        <>
          {/* Search */}
          <SearchInput
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery("")}
            placeholder="Search connections by host, port, or alias..."
            value={searchQuery}
          />
          <div className="flex-1 h-full border border-input rounded-md shadow-xs overflow-y-auto px-4 py-2">
            {!hasAnyResults && q ? (
              <div className="text-center py-8 text-muted-foreground min-h-40">
                No connections match "{searchQuery}"
              </div>
            ) : (
              <>
                {/* for clusters */}
                {hasFilteredClusters && (
                  <div className="mb-8">
                    <Typography className="mb-2" variant="bodyLg">Clusters</Typography>
                    <div>
                      {Object.entries(displayClusterGroups).map(([clusterId, clusterConnections]) => (
                        <ClusterConnectionGroup
                          clusterId={clusterId}
                          connections={clusterConnections}
                          highlight={highlight}
                          key={clusterId}
                          onEdit={handleEditConnection}
                          onPasswordRequired={handlePasswordRequired}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* for standalone instances */}
                {hasFilteredStandalone && (
                  <div>
                    <Typography className="mb-2" variant="bodyLg">Instances</Typography>
                    <div>
                      {filteredStandaloneConnections.map(({ connectionId, connection }) => (
                        <ConnectionEntry
                          connection={connection}
                          connectionId={connectionId}
                          highlight={highlight}
                          key={connectionId}
                          onEdit={handleEditConnection}
                          onPasswordRequired={handlePasswordRequired}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div></>
      )}
    </RouteContainer>
  )
}
