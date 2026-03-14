import * as React from "react"
import { Typography } from "./typography"
import { cn } from "@/lib/utils"

interface EmptyStateProps extends React.ComponentProps<"div"> {
  title: string
  description?: string
  action?: React.ReactNode
  icon?: React.ReactNode
}

function EmptyState({
  title,
  description,
  action,
  icon,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "h-full w-full flex items-center justify-center flex-col gap-4",
        className,
      )}
      {...props}
    >
      <div className="text-center">
        {icon && <div className="flex justify-center mb-3 opacity-30">{icon}</div>}
        <Typography className="text-gray-700 dark:text-white mb-2" variant="subheading">
          {title}
        </Typography>
        {description && (
          <Typography className="text-gray-500 dark:text-gray-400 mb-6" variant="bodySm">
            {description}
          </Typography>
        )}
        {action}
      </div>
    </div>
  )
}

export { EmptyState }
