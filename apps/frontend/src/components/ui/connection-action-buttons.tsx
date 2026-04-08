import { Plug, Unplug, PencilIcon, Trash2Icon } from "lucide-react"
import { useSelector } from "react-redux"
import { MAX_CONNECTIONS } from "@common/src/constants"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { selectIsAtConnectionLimit, selectIsAnyConnecting } from "@/state/valkey-features/connection/connectionSelectors"

interface ConnectionActionButtonsProps {
  isConnected: boolean
  isConnecting: boolean
  onConnect?: () => void
  onDisconnect?: () => void
  onEdit?: () => void
  onDelete?: () => void
  className?: string
}

function ConnectionActionButtons({
  isConnected,
  isConnecting,
  onConnect,
  onDisconnect,
  onEdit,
  onDelete,
  className,
}: ConnectionActionButtonsProps) {
  const isAtConnectionLimit = useSelector(selectIsAtConnectionLimit)
  const isAnyConnecting = useSelector(selectIsAnyConnecting)
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {isConnected && onDisconnect && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={onDisconnect} size="sm" variant="ghost">
              <Unplug size={16} />
              Disconnect
            </Button>
          </TooltipTrigger>
          <TooltipContent>Disconnect from this Valkey instance</TooltipContent>
        </Tooltip>
      )}
      {!isConnected && !isConnecting && onConnect && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button disabled={isAtConnectionLimit || isAnyConnecting} onClick={onConnect} size="sm" variant="ghost">
                <Plug size={16} />
                Connect
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{isAtConnectionLimit 
            ? `Disconnect one of your ${MAX_CONNECTIONS} active connections to continue` 
            : isAnyConnecting
              ? "Another connection is in progress"
              : "Connect to this Valkey instance"}</TooltipContent>
        </Tooltip>
      )}
      {!isConnected && isConnecting && (
        <span className="flex items-center gap-1 px-2 text-sm text-muted-foreground">
          <Loader2 className="animate-spin" size={16} />
          Connecting...
        </span>
      )}
      {onEdit && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label="Edit connection settings" disabled={isAnyConnecting} onClick={onEdit} size="sm" variant="ghost">
              <PencilIcon size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit connection settings</TooltipContent>
        </Tooltip>
      )}
      {onDelete && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label="Delete connection" disabled={isAnyConnecting} onClick={onDelete} size="sm" variant="destructiveGhost">
              <Trash2Icon size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete this connection</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

export { ConnectionActionButtons }
