import { ArrowUp, ArrowDown } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type SortOrder = "asc" | "desc"

interface SortableTableHeaderProps {
  label: ReactNode
  icon?: ReactNode
  active?: boolean
  sortOrder?: SortOrder
  onClick?: () => void
  className?: string
  width?: string
}

export function SortableTableHeader({
  label,
  icon,
  active = false,
  sortOrder = "desc",
  onClick,
  className,
  width,
}: SortableTableHeaderProps) {
  return (
    <button
      className={cn(
        "text-xs font-bold flex items-center justify-center gap-2 hover:text-primary transition-colors",
        active && "text-primary",
        width,
        className,
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
      {active && (sortOrder === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
    </button>
  )
}

interface StaticTableHeaderProps {
  label: ReactNode
  icon?: ReactNode
  className?: string
  width?: string
}

export function StaticTableHeader({
  label,
  icon,
  className,
  width,
}: StaticTableHeaderProps) {
  const shouldCenter = className?.includes("text-center")
  return (
    <div
      className={cn(
        "text-xs font-bold flex items-center gap-2",
        shouldCenter && "justify-center",
        width,
        className,
      )}
    >
      {icon}
      {label}
    </div>
  )
}
