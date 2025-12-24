import { CONNECTED, ERROR, DISCONNECTED, CONNECTING } from "@common/src/constants.ts"
import {
  AlertCircleIcon,
  CircleChevronRight,
  CircleDotIcon,
  CircleSmallIcon,
  PencilIcon,
  PowerIcon,
  PowerOffIcon,
  Trash2Icon,
  Server,
  CheckIcon,
  XIcon
} from "lucide-react"
import { Link } from "react-router"
import { useState } from "react"
import {
  type ConnectionState,
  connectPending,
  closeConnection,
  deleteConnection,
  updateConnectionDetails
} from "@/state/valkey-features/connection/connectionSlice"
import { Button } from "@/components/ui/button.tsx"
import { cn } from "@/lib/utils.ts"
import history from "@/history.ts"
import { useAppDispatch } from "@/hooks/hooks.ts"

interface ConnectionEntryProps {
  connectionId: string
  connection: ConnectionState
  clusterId?: string
  hideOpenButton?: boolean
  isNested?: boolean
}

export const ConnectionEntry = ({
  connectionId,
  connection,
  clusterId,
  hideOpenButton = false,
  isNested = false,
}: ConnectionEntryProps) => {
  const dispatch = useAppDispatch()
  const [isEditing, setIsEditing] = useState(false)
  const [editedAlias, setEditedAlias] = useState(connection.connectionDetails.alias || "")

  const handleDisconnect = () => dispatch(closeConnection({ connectionId }))
  const handleConnect = () => dispatch(connectPending({ ...connection.connectionDetails, connectionId }))
  const handleDelete = () => dispatch(deleteConnection({ connectionId }))

  const handleEdit = () => {
    setEditedAlias(connection.connectionDetails.alias || "")
    setIsEditing(true)
  }

  const handleSave = () => {
    dispatch(updateConnectionDetails({
      connectionId,
      alias: editedAlias.trim() || undefined,
    }))
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditedAlias(connection.connectionDetails.alias || "")
    setIsEditing(false)
  }

  const isConnected = connection.status === CONNECTED
  const isConnecting = connection.status === CONNECTING
  const isError = connection.status === ERROR
  const isDisconnected = connection.status === DISCONNECTED
  const label = connection.connectionDetails.username
    ? `${connection.connectionDetails.username}@${connection.connectionDetails.host}:${connection.connectionDetails.port}`
    : `${connection.connectionDetails.host}:${connection.connectionDetails.port}`
  const aliasLabel = connection.connectionDetails.alias || label

  const lastConnectionTime = connection.connectionHistory?.at(-1) ?? null

  const StatusBadge = () => {
    if (isConnected) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-teal-100 dark:bg-teal-900/30
         text-teal-700 dark:text-teal-400 rounded-full">
          <CircleDotIcon size={12} />
          Connected
        </span>
      )
    }
    if (isDisconnected) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-orange-100 dark:bg-orange-900/30
         text-orange-700 dark:text-orange-400 rounded-full">
          <AlertCircleIcon size={12} />
          Disconnected
        </span>
      )
    }
    if (isError) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-red-100 dark:bg-red-900/30
         text-red-700 dark:text-red-400 rounded-full">
          <AlertCircleIcon size={12} />
          Error
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-800
       text-gray-600 dark:text-gray-400 rounded-full">
        <CircleSmallIcon size={12} />
        Not Connected
      </span>
    )
  }

  // for cluster instances
  if (isNested) {
    return (
      <div className="p-3 bg-white dark:bg-tw-dark-primary rounded border dark:border-tw-dark-border">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <StatusBadge />
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
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                Last connected: {new Date(lastConnectionTime.timestamp).toLocaleString()}
              </span>
            )}</div>

          {/* action buttons */}
          <div className="flex items-center gap-1">
            {isConnected && (
              <>
                <Button onClick={handleDisconnect} size="sm" variant="ghost">
                  <PowerOffIcon size={16} />
                </Button>
              </>
            )}
            {(isDisconnected || (!isConnected && !isConnecting)) && (
              <Button onClick={handleConnect} size="sm" variant="ghost">
                <PowerIcon size={16} />
              </Button>
            )}
            <Button onClick={handleDelete} size="sm" variant="destructiveGhost">
              <Trash2Icon size={16} />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // for standalone instnces
  return (
    <div className="mb-3 p-2 border dark:border-tw-dark-border rounded bg-white dark:bg-tw-dark-primary">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-2 bg-tw-primary/10 dark:bg-tw-primary/20 rounded">
            <Server className="text-tw-primary" size={18} />
          </div>

          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="flex items-center gap-2 mb-1">
                <input
                  autoFocus
                  className="px-2 py-1 text-sm font-mono border dark:border-tw-dark-border rounded
                    bg-white dark:bg-tw-primary/20 focus:outline-none focus:ring-2 focus:ring-tw-primary"
                  onChange={(e) => setEditedAlias(e.target.value)}
                  placeholder={label}
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
              <Button
                asChild
                className={cn(!isConnected && "pointer-events-none opacity-60", "justify-start p-0 h-auto font-mono text-sm mb-1 truncate")}
                variant="link"
              >
                <Link title={aliasLabel} to={clusterId ? `/${clusterId}/${connectionId}/dashboard` : `/${connectionId}/dashboard`}>
                  {aliasLabel}
                </Link>
              </Button>
            )}
            {!isEditing && connection.connectionDetails.alias && (
              <span className="ml-1 font-mono text-xs text-tw-dark-border dark:text-white/50">
                ({label})
              </span>)}
            <div className="flex items-center gap-3">
              <StatusBadge />
              {lastConnectionTime && lastConnectionTime.event === CONNECTED && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Last connected: {new Date(lastConnectionTime.timestamp).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isConnected && (
            <>
              {!hideOpenButton && (
                <button
                  className="flex items-center gap-1 p-2 rounded-md text-tw-primary border border-tw-primary/70
                   hover:bg-tw-primary hover:text-white"
                  onClick={() => history.navigate(clusterId ? `/${clusterId}/${connectionId}/dashboard` : `/${connectionId}/dashboard`)}
                >
                  <CircleChevronRight size={16} />
                  Open
                </button>
              )}
              <Button disabled={isEditing} onClick={handleEdit} size="sm" variant="ghost">
                <PencilIcon size={16} />
              </Button>
              <Button disabled={isEditing} onClick={handleDisconnect} size="sm" variant="ghost">
                <PowerOffIcon size={16} />
              </Button>
            </>
          )}
          {(isDisconnected || (!isConnected && !isConnecting)) && (
            <Button onClick={handleConnect} size="sm" variant="ghost">
              <PowerIcon size={16} />
            </Button>
          )}
          <Button disabled={isEditing} onClick={handleDelete} size="sm" variant="destructiveGhost">
            <Trash2Icon size={16} />
          </Button>
        </div>
      </div>
    </div>
  )
}
