import { Button } from "./button"
import type { ReactNode } from "react"

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
    <nav className={`flex gap-2 ${className}`}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <Button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            size={"sm"}
            type="button"
            variant={isActive ? "default" : "outline"}
          >
            {tab.label}
          </Button>
        )
      })}
    </nav>
  )
}
