import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface TableContainerProps {
  header: ReactNode
  children: ReactNode
  className?: string
}

export function TableContainer({ header, children, className }: TableContainerProps) {
  return (
    <div className={cn("h-full w-full flex flex-col", className)}>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b-2 dark:border-tw-dark-border">
        <div className="flex items-center px-4 py-3">{header}</div>
      </div>

      {/* Contents */}
      <div
        aria-label="Table content"
        className="flex-1 overflow-y-auto"
        role="region"
        tabIndex={0}
      >
        <table className="w-full">
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  )
}
