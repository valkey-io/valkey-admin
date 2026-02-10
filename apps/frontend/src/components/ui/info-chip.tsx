import { CustomTooltip } from "./tooltip"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface InfoChipProps {
  children: ReactNode
  tooltip: string
  showBorder?: boolean
  className?: string
}

export function InfoChip({
  children,
  tooltip,
  showBorder = true,
  className,
}: InfoChipProps) {
  return (
    <CustomTooltip content={tooltip}>
      <span
        className={cn(
          "text-xs px-2 py-1 rounded-full text-tw-primary dark:text-white",
          showBorder && "border-2 border-tw-primary",
          className,
        )}
      >
        {children}
      </span>
    </CustomTooltip>
  )
}
