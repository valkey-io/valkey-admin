import { useEffect, useRef, useState } from "react"
import { ChevronDown, ListFilter } from "lucide-react"
import { truncateText } from "@common/src/truncate-text"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Typography } from "../../ui/typography"

interface NodeFilterDropdownProps {
  nodes: string[]
  selectedNode: string
  onSelect: (node: string) => void
  align?: "left" | "right"
}

export function NodeFilterDropdown({ nodes, selectedNode, onSelect, align = "left" }: NodeFilterDropdownProps) {
  const [open, setOpen] = useState(false)
  const [nodeSearch, setNodeSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  const filtered = nodeSearch
    ? nodes.filter((n) => n.toLowerCase().includes(nodeSearch.toLowerCase()))
    : nodes

  return (
    <div className="relative" ref={ref}>
      <Button
        className="w-full"
        onClick={() => setOpen((prev) => !prev)}
        type="button"
        variant="outline"
      >
        <ListFilter className="text-primary" size={14} />
        <span className="max-w-32 truncate">
          {selectedNode === "all" ? "All Nodes" : truncateText(selectedNode, 20)}
        </span>
        <ChevronDown className="text-muted-foreground" size={14} />
      </Button>

      {open && (
        <div className={`absolute z-50 ${align === "right" ? "right-0" : "left-0"} top-11 w-64 rounded-md border bg-popover shadow-md p-2`}>
          <div className="relative mb-2">
            <Input
              autoFocus
              className="h-7 pl-2 text-xs"
              onChange={(e) => setNodeSearch(e.target.value)}
              placeholder="Search nodes..."
              value={nodeSearch}
            />
          </div>
          <ul className="max-h-48 overflow-y-auto space-y-0.5">
            <li>
              <button
                className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-primary/10
                    ${selectedNode === "all" ? "bg-primary/10 font-medium" : ""}`}
                onClick={() => { onSelect("all"); setOpen(false); setNodeSearch("") }}
                type="button"
              >
                All Nodes
              </button>
            </li>
            {filtered.length === 0 && (
              <li>
                <Typography className="px-2 py-1.5 text-muted-foreground" variant="caption">
                  No nodes found
                </Typography>
              </li>
            )}
            {filtered.map((nodeId) => (
              <li key={nodeId}>
                <button
                  className={`w-full text-left px-2 py-1.5 rounded text-sm font-mono hover:bg-primary/10
                      ${selectedNode === nodeId ? "bg-primary/10 font-medium" : ""}`}
                  onClick={() => { onSelect(nodeId); setOpen(false); setNodeSearch("") }}
                  type="button"
                >
                  {truncateText(nodeId)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
