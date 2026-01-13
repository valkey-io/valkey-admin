import React from "react"
import { ArrowUp, ArrowDown, Type, Clock, HardDrive } from "lucide-react"
import { Button } from "./button"

export type SortField = "name" | "ttl" | "size"
export type SortDirection = "asc" | "desc"

export interface SortOption {
  field: SortField
  direction: SortDirection
}

export interface KeySortControlProps {
  currentSort: SortOption
  onSortChange: (sort: SortOption) => void
  disabled?: boolean
}

const sortOptions: Array<{ field: SortField; label: string; icon: React.ReactNode }> = [
  { field: "name", label: "Name", icon: <Type size={14} /> },
  { field: "ttl", label: "TTL", icon: <Clock size={14} /> },
  { field: "size", label: "Size", icon: <HardDrive size={14} /> },
]

export function KeySortControl({ currentSort, onSortChange, disabled = false }: KeySortControlProps) {
  const handleSortClick = (field: SortField) => {
    if (currentSort.field === field) {
      // Toggle direction if same field is clicked
      onSortChange({
        field,
        direction: currentSort.direction === "asc" ? "desc" : "asc",
      })
    } else {
      // Set new field with ascending direction
      onSortChange({
        field,
        direction: "asc",
      })
    }
  }

  return (
    <div className="flex items-center gap-1">
      {sortOptions.map(({ field, label, icon }) => {
        const isActive = currentSort.field === field
        const direction = isActive ? currentSort.direction : "asc"

        return (
          <Button
            className="flex items-center gap-1.5"
            disabled={disabled}
            key={field}
            onClick={() => handleSortClick(field)}
            size="sm"
            variant={isActive ? "default" : "outline"}
          >
            {icon}
            {label}
            {isActive && (
              direction === "asc" ? (
                <ArrowUp size={12} />
              ) : (
                <ArrowDown size={12} />
              )
            )}
          </Button>
        )
      })}
    </div>
  )
}
