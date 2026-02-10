import { CONNECTED, ERROR, CONNECTING } from "@common/src/constants.ts"
import { CircleChevronRight, Server } from "lucide-react"
import { Link } from "react-router"
import {
  type ConnectionState,
  connectPending,
  closeConnection,
  deleteConnection
} from "@/state/valkey-features/connection/connectionSlice"
import { Button } from "@/components/ui/button.tsx"
import { ConnectionStatusBadge } from "@/components/ui/connection-status-badge"
import { ConnectionActionButtons } from "@/components/ui/connection-action-buttons.tsx"
import { cn } from "@/lib/utils.ts"
import history from "@/history.ts"
import { useAppDispatch } from "@/hooks/hooks.ts"

interface ConnectionEntryProps {
  connectionId: string
  connection: ConnectionState
  clusterId?: string
  hideOpenButton?: boolean
  isNested?: boolean
  onEdit?: (connectionId: string) => void
}

export const ConnectionEntry = ({
  connectionId,
  connection,
  clusterId,
  hideOpenButton = false,
  isNested = false,
  onEdit,
}: ConnectionEntryProps) => {
  const dispatch = useAppDispatch()

  const handleDisconnect = () => dispatch(closeConnection({ connectionId }))
  const handleConnect = () => dispatch(connectPending({
    connectionDetails: connection.connectionDetails,
    connectionId,
    preservedHistory: connection.connectionHistory,
  }))
  const handleDelete = () => dispatch(deleteConnection({ connectionId }))

  const handleEdit = () => {
    onEdit?.(connectionId)
  }

  const isConnected = connection.status === CONNECTED
  const isConnecting = connection.status === CONNECTING
  const isError = connection.status === ERROR
  const label = connection.connectionDetails.username
    ? `${connection.connectionDetails.username}@${connection.connectionDetails.host}:${connection.connectionDetails.port}`
    : `${connection.connectionDetails.host}:${connection.connectionDetails.port}`
  const aliasLabel = connection.connectionDetails.alias || label

  const lastConnectionTime = connection.connectionHistory?.at(-1) ?? null

  const statusType = isConnected ? "connected" : isError ? "error" : "disconnected"

  // for cluster instances
  if (isNested) {
    return (
      <div className="p-3 border border-input rounded-md shadow-xs bg-white dark:bg-tw-dark-primary">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <ConnectionStatusBadge status={statusType} />
              <Button
                asChild
                className={cn(!isConnected && "pointer-events-none opacity-60", "justify-start p-0 h-auto font-mono text-sm truncate")}
                variant="link"
              >
                <Link title={label} to={clusterId ? `/${clusterId}/${connectionId}/dashboard` : `/${connectionId}/dashboard`}>
                  {label}
                </Link>
              </Button>
            </div>{lastConnectionTime && lastConnectionTime.event === CONNECTED && (
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-1 truncate" title={`Last connected: ${new Date(lastConnectionTime.timestamp).toLocaleString()}`}>
                Last connected: {new Date(lastConnectionTime.timestamp).toLocaleString()}
              </span>
            )}</div>

          {/* action buttons */}
          <ConnectionActionButtons
            isConnected={isConnected}
            isConnecting={isConnecting}
            onConnect={handleConnect}
            onDelete={handleDelete}
            onDisconnect={handleDisconnect}
            onEdit={handleEdit}
          />
        </div>
      </div>
    )
  }

  // for standalone instances
  return (
    <div className="mb-3 p-2 border border-input rounded-md shadow-xs bg-white dark:bg-tw-dark-primary">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-2 bg-tw-primary/10 dark:bg-tw-primary/20 rounded">
            <Server className="text-tw-primary" size={18} />
          </div>

          <div className="flex-1 min-w-0">
            <Button
              asChild
              className={cn(!isConnected && "pointer-events-none opacity-60", "justify-start p-0 h-auto font-mono text-sm mb-1 truncate")}
              variant="link"
            >
              <Link title={aliasLabel} to={clusterId ? `/${clusterId}/${connectionId}/dashboard` : `/${connectionId}/dashboard`}>
                {aliasLabel}
              </Link>
            </Button>
            {connection.connectionDetails.alias && (
              <span className="ml-1 font-mono text-xs text-tw-dark-border dark:text-white/50 truncate" title={label}>
                ({label})
              </span>)}
            <div className="flex items-center gap-3">
              <ConnectionStatusBadge status={statusType} />
              {lastConnectionTime && lastConnectionTime.event === CONNECTED && (
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate" title={`Last connected: ${new Date(lastConnectionTime.timestamp).toLocaleString()}`}>
                  Last connected: {new Date(lastConnectionTime.timestamp).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isConnected && !hideOpenButton && (
            <Button
              className="flex items-center gap-1 hover:border-primary"
              onClick={() => history.navigate(clusterId ? `/${clusterId}/${connectionId}/dashboard` : `/${connectionId}/dashboard`)}
              size="sm"
              variant="outline"
            >
              <CircleChevronRight size={16} />
              Open
            </Button>
          )}
          <ConnectionActionButtons
            isConnected={isConnected}
            isConnecting={isConnecting}
            onConnect={handleConnect}
            onDelete={handleDelete}
            onDisconnect={handleDisconnect}
            onEdit={handleEdit}
          />
        </div>
      </div>
    </div>
  )
}
