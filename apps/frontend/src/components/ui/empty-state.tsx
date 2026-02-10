import * as React from "react"
import { cn } from "@/lib/utils"

interface EmptyStateProps extends React.ComponentProps<"div"> {
  title: string
  description?: string
  action?: React.ReactNode
}

function EmptyState({
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex-1 flex items-center justify-center flex-col gap-4",
        className,
      )}
      {...props}
    >
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-700 dark:text-white mb-2">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            {description}
          </p>
        )}
        {action}
      </div>
    </div>
  )
}

export { EmptyState }
