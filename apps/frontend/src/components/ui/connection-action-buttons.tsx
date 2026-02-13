import { Plug, Unplug, PencilIcon, Trash2Icon } from "lucide-react"
import { useSelector } from "react-redux"
import { MAX_CONNECTIONS } from "@common/src/constants"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { selectIsAtConnectionLimit } from "@/state/valkey-features/connection/connectionSelectors"

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
              <Button disabled={isAtConnectionLimit} onClick={onConnect} size="sm" variant="ghost">
                <Plug size={16} />
                Connect
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{isAtConnectionLimit 
            ? `Disconnect one of your ${MAX_CONNECTIONS} active connections to continue` : "Connect to this Valkey instance"}</TooltipContent>
        </Tooltip>
      )}
      {onEdit && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={onEdit} size="sm" variant="ghost">
              <PencilIcon size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit connection settings</TooltipContent>
        </Tooltip>
      )}
      {onDelete && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={onDelete} size="sm" variant="destructiveGhost">
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
