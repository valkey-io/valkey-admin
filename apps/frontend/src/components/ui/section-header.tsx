import * as React from "react"
import { cn } from "@/lib/utils"

interface SectionHeaderProps extends React.ComponentProps<"h2"> {
  children: React.ReactNode
}

function SectionHeader({ children, className, ...props }: SectionHeaderProps) {
  return (
    <h2
      className={cn(
        "text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 px-1",
        className,
      )}
      {...props}
    >
      {children}
    </h2>
  )
}

export { SectionHeader }
