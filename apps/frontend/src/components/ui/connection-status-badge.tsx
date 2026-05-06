import * as React from "react"
import { CircleDotIcon, AlertCircleIcon, CircleSmallIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface ConnectionStatusBadgeProps extends React.ComponentProps<"span"> {
  status: "connected" | "error" | "disconnected"
}

const statusConfig = {
  connected: {
    icon: CircleDotIcon,
    label: "Connected",
    className: "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400",
  },
  error: {
    icon: AlertCircleIcon,
    label: "Error",
    className: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  },
  disconnected: {
    icon: CircleSmallIcon,
    label: "Not Connected",
    className: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
  },
}

function ConnectionStatusBadge({ status, className, ...props }: ConnectionStatusBadgeProps) {
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full",
        config.className,
        className,
      )}
      {...props}
    >
      <Icon size={12} />
      {config.label}
    </span>
  )
}

export { ConnectionStatusBadge }
