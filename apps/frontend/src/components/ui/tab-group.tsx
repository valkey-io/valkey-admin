import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface TabOption<T extends string = string> {
  id: T
  label: ReactNode
}

interface TabGroupProps<T extends string = string> {
  tabs: TabOption<T>[]
  activeTab: T
  onChange: (tabId: T) => void
  className?: string
}

export function TabGroup<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  className = "",
}: TabGroupProps<T>) {
  return (
    <nav className={cn("flex gap-4 border-b border-input", className)}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            className={cn(
              "px-1 py-2 -mb-px text-sm font-medium border-b-2 transition-colors cursor-pointer",
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40",
            )}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
