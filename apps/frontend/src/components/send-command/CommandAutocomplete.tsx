import { useEffect, useRef } from "react"
import { Typography } from "../ui/typography"
import type { MatchResult, ValkeyCommand } from "@/components/send-command/valkey-command-matching"
import { cn } from "@/lib/utils"

type Props = {
  matches: MatchResult[]
  selectedIndex: number
  onSelect: (command: ValkeyCommand) => void
  onHoverIndex: (index: number) => void
}

function matchHighlights(text: string, ranges: Array<[number, number]>) {
  if (ranges.length === 0) return text
  const parts: React.ReactNode[] = []
  let cursor = 0
  ranges.forEach(([start, end], i) => {
    if (start > cursor) parts.push(text.slice(cursor, start))
    parts.push(
      <span className="bg-primary text-white px-0.5 rounded font-bold" key={`${start}-${end}-${i}`}>
        {text.slice(start, end)}
      </span>,
    )
    cursor = end
  })
  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts
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
      {matches.map(({ command, highlightRanges }, i) => {
        const isSelected = i === selectedIndex
        return (
          <li
            aria-selected={isSelected}
            className={cn(
              "flex flex-col gap-0.5 px-3 py-1.5 cursor-pointer",
              isSelected && "bg-primary/20 text-accent-foreground",
            )}
            key={command.name}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(command)
            }}
            onMouseEnter={() => onHoverIndex(i)}
            ref={isSelected ? selectedRef : undefined}
          >
            <div className="flex items-center gap-2">
              <Typography variant={"code"}>{matchHighlights(command.name, highlightRanges)}</Typography>
              <Typography className="text-xs text-muted-foreground truncate" variant={"code"}>{command.syntax}</Typography>
            </div>
            <Typography variant={"bodyXs"}>{command.description}</Typography>
          </li>
        )
      })}
    </ul>
  )
}
