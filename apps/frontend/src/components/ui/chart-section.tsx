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
          {title && <h3 className="text-lg font-bold mb-2 text-center">{title}</h3>}
          {subtitle && (
            <span className="text-center text-sm text-gray-600 dark:text-gray-400">
              {subtitle}
            </span>
          )}
        </div>
      )}

      {/* Content or Empty State */}
      {isEmpty ? (
        <div className="flex items-center justify-center h-[300px] border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
          <div className="text-center">
            <p className="text-gray-500 dark:text-gray-400">
              {emptyMessage}
            </p>
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  )
}
