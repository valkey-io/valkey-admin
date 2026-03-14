import { Typography } from "./typography"
import type { ReactNode } from "react"

interface ChartSectionProps {
  title?: string
  subtitle?: string
  action?: ReactNode
  children?: ReactNode
  isEmpty?: boolean
  emptyMessage?: string
  className?: string
}

export function ChartSection({
  title,
  subtitle,
  action,
  children,
  isEmpty = false,
  emptyMessage = "No data available",
  className = "",
}: ChartSectionProps) {
  return (
    <div className={`border border-input rounded-md shadow-xs p-4 bg-white dark:bg-gray-800 ${className}`}>
      {/* time range selector buttons */}
      {action && (
        <div className="flex justify-end mb-4">
          {action}
        </div>
      )}

      {/* Header */}
      {(title || subtitle) && (
        <div className="flex flex-col items-center mb-6">
          {title && (
            <Typography className="mb-2 text-center" variant="subheading">
              {title}
            </Typography>
          )}
          {subtitle && (
            <Typography className="text-center" variant="bodySm">
              {subtitle}
            </Typography>
          )}
        </div>
      )}

      {/* Content or Empty State */}
      {isEmpty ? (
        <div className="flex items-center justify-center h-[300px] border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
          <div className="text-center">
            <Typography className="text-gray-500 dark:text-gray-400" variant="body">
              {emptyMessage}
            </Typography>
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  )
}
