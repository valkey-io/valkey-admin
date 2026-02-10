import { Plug, Unplug, PencilIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

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
            <Button onClick={onConnect} size="sm" variant="ghost">
              <Plug size={16} />
              Connect
            </Button>
          </TooltipTrigger>
          <TooltipContent>Connect to this Valkey instance</TooltipContent>
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
