import * as React from "react"
import { Search, CircleX } from "lucide-react"
import { cn } from "@/lib/utils"

interface SearchInputProps extends Omit<React.ComponentProps<"input">, "type"> {
  onClear?: () => void
  showClearButton?: boolean
}

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, onClear, showClearButton = true, value, ...props }, ref) => {
    const hasValue = value !== undefined && value !== ""

    return (
      <div className="relative flex items-center w-full">
        <div className="absolute left-3 pointer-events-none text-muted-foreground">
          <Search size={16} />
        </div>
        <input
          className={cn(
            "flex h-10 w-full items-center rounded-md border border-input bg-white dark:bg-input/30",
            "pl-10 pr-10 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none",
            "placeholder:text-muted-foreground",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          data-slot="search-input"
          ref={ref}
          type="search"
          value={value}
          {...props}
        />
        {showClearButton && hasValue && onClear && (
          <button
            className="absolute right-3 text-primary hover:text-primary/80 transition-colors"
            onClick={onClear}
            type="button"
          >
            <CircleX size={14} />
          </button>
        )}
      </div>
    )
  },
)

SearchInput.displayName = "SearchInput"

export { SearchInput }
