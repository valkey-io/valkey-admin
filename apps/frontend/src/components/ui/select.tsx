import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface SelectProps extends React.ComponentProps<"select"> {
  icon?: React.ReactNode
}

function Select({ className, icon, children, ...props }: SelectProps) {
  return (
    <div className="relative inline-flex items-center">
      {icon && (
        <div className="absolute left-3 pointer-events-none text-muted-foreground">
          {icon}
        </div>
      )}
      <select
        aria-label="Select option"
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-white dark:bg-input/30",
          "px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "appearance-none cursor-pointer",
          icon && "pl-10",
          "pr-8",
          className,
        )}
        data-slot="select"
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="absolute right-3 pointer-events-none text-muted-foreground"
        size={16}
      />
    </div>
  )
}

export { Select }
