import type { ReactNode } from "react"

interface PanelProps {
  children?: ReactNode
  className?: string
  loading?: boolean
  emptyState?: ReactNode
  isEmpty?: boolean
}

export function Panel({
  children,
  className = "",
  loading = false,
  emptyState,
  isEmpty = false,
}: PanelProps) {
  if (isEmpty && emptyState) {
    return (
      <div className={`h-full p-2 border border-input rounded-md shadow-xs flex items-center justify-center ${className}`}>
        {emptyState}
      </div>
    )
  }

  return (
    <div
      className={`h-full border border-input rounded-md shadow-xs overflow-hidden ${
        loading ? "opacity-50 pointer-events-none" : ""
      } ${className}`}
    >
      {children}
    </div>
  )
}
