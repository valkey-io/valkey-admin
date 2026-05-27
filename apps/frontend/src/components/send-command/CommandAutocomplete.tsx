import { useEffect, useRef } from "react"
import { Typography } from "../ui/typography"
import type { ValkeyCommand } from "@common/src/valkey-commands"
import { cn } from "@/lib/utils"

type Props = {
  matches: ValkeyCommand[]
  selectedIndex: number
  onSelect: (command: ValkeyCommand) => void
  onHoverIndex: (index: number) => void
}

export function CommandAutocomplete({ matches, selectedIndex, onSelect, onHoverIndex }: Props) {
  const selectedRef = useRef<HTMLLIElement>(null)

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  if (matches.length === 0) return null

  return (
    <ul
      className="absolute bottom-full left-0 right-0 mb-2 z-50 max-h-60 overflow-y-auto rounded-md 
      border border-primary/40 bg-accent shadow-md"
    >
      {matches.map((cmd, i) => {
        const isSelected = i === selectedIndex
        return (
          <li
            aria-selected={isSelected}
            className={cn(
              "flex flex-col gap-0.5 px-3 py-1.5 cursor-pointer",
              isSelected && "bg-primary/20 text-accent-foreground",
            )}
            key={cmd.name}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(cmd)
            }}
            onMouseEnter={() => onHoverIndex(i)}
            ref={isSelected ? selectedRef : undefined}
          >
            <div className="flex items-center gap-2">
              <Typography variant={"code"}>{cmd.name}</Typography>
              <Typography className="text-xs text-muted-foreground truncate" variant={"code"}>{cmd.syntax}</Typography>
            </div>
            <Typography variant={"bodyXs"}>{cmd.description}</Typography>
          </li>
        )
      })}
    </ul>
  )
}
