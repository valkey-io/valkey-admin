import { useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { Flame, Server, X } from "lucide-react"
import { truncateText } from "@common/src/truncate-text"
import { Typography } from "../../ui/typography"
import { Button } from "../../ui/button"

interface HotKeysHeatmapModalProps {
  open: boolean
  onClose: () => void
  data: [string, number, number | null, number, string?][]
}

interface NodeStat {
  nodeId: string
  count: number
  totalAccess: number
}

interface HoveredTile {
  nodeId: string
  count: number
  totalAccess: number
  x: number
  y: number
}

const LEGEND_STEPS = [0, 0.25, 0.5, 0.75, 1]

function getColor(ratio: number): string {
  const lightness = Math.round(90 - ratio * 62)
  const saturation = Math.round(70 + ratio * 15)
  return `hsl(0, ${saturation}%, ${lightness}%)`
}

function snapToBucket(ratio: number): number {
  return Math.round(ratio * 4) / 4
}

export function HotKeysHeatmapModal({ open, onClose, data }: HotKeysHeatmapModalProps) {
  const [hovered, setHovered] = useState<HoveredTile | null>(null)
  const [selectedBuckets, setSelectedBuckets] = useState<Set<number>>(new Set())

  const nodeStats = data.reduce((acc, [, accessCount, , , nodeId]) => {
    const key = nodeId ?? "Unknown"
    acc[key] ??= { nodeId: key, count: 0, totalAccess: 0 }
    acc[key].count += 1
    acc[key].totalAccess += accessCount
    return acc
  }, {} as Record<string, NodeStat>)

  const sorted: NodeStat[] = Object.values(nodeStats).sort((a, b) => b.count - a.count)
  const max = sorted[0]?.count ?? 1
  const min = sorted[sorted.length - 1]?.count ?? 0

  const hasBucketFilter = selectedBuckets.size > 0

  const isActive = (ratio: number) =>
    !hasBucketFilter || selectedBuckets.has(snapToBucket(ratio))

  const toggleBucket = (step: number) => {
    setSelectedBuckets((prev) => {
      const next = new Set(prev)
      if (next.has(step)) { next.delete(step) } else { next.add(step) }
      return next
    })
  }

  const handleMouseEnter = (stat: NodeStat, e: React.MouseEvent) => {
    setHovered({ ...stat, x: e.clientX, y: e.clientY })
  }
  const handleMouseMove = (e: React.MouseEvent) => {
    if (hovered) setHovered((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
  }
  const handleMouseLeave = () => setHovered(null)

  return (
    <Dialog.Root onOpenChange={onClose} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-black/50" />
        <Dialog.Content asChild>
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
            <div className="w-1/2 h-1/2 bg-background rounded-xl border border-border shadow-xl flex flex-col">

              {/* Header */}
              <div className="flex items-start justify-between px-6 py-4 border-b border-border">
                <div className="flex flex-col gap-0.5">
                  <Dialog.Title asChild>
                    <Typography variant="subheading">Node Heatmap</Typography>
                  </Dialog.Title>
                  <Dialog.Description asChild>
                    <Typography variant="bodyXs">
                      Hot key concentration across cluster nodes
                    </Typography>
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <Button className="hover:text-primary p-1 shrink-0 -mt-1 -mr-1" size="sm" variant="ghost">
                    <X size={16} />
                  </Button>
                </Dialog.Close>
              </div>

              {/* Body */}
              <div className="flex-1 flex flex-col gap-5 px-6 py-5 overflow-y-auto min-h-0">

                {/* Summary chips */}
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
                    <Server className="text-primary" size={12} />
                    <Typography variant="bodyXs">
                      {sorted.length} node{sorted.length !== 1 ? "s" : ""}
                    </Typography>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
                    <Flame className="text-primary" size={12} />
                    <Typography variant="bodyXs">
                      {data.length} hot key{data.length !== 1 ? "s" : ""}
                    </Typography>
                  </div>
                </div>

                {/* Legend with filter */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <Typography variant="bodyXs">
                      Select one or multiple legends to filter nodes by hot key concentration
                    </Typography>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {LEGEND_STEPS.map((step) => {
                          const isSelected = selectedBuckets.has(step)
                          return (
                            <button
                              className={`w-5 h-5 rounded-lg transition-all focus:outline-none
                                ${isSelected
                              ? "ring-2 ring-offset-1 ring-foreground scale-110"
                              : hasBucketFilter && !isSelected
                                ? "opacity-30 hover:opacity-70"
                                : "hover:scale-110 hover:ring-1 hover:ring-border"
                            }`}
                              key={step}
                              onClick={() => toggleBucket(step)}
                              style={{ backgroundColor: getColor(step) }}
                              type="button"
                            />
                          )
                        })}
                      </div>

                    </div>
                  </div>

                  {/* Tile grid */}
                  <div className="rounded-lg border border-border bg-muted/40 p-4 min-h-16 max-h-40 overflow-y-auto">
                    <div className="flex flex-wrap gap-1.5">
                      {sorted.map((stat) => {
                        const ratio = max === min ? 0 : (stat.count - min) / (max - min)
                        return (
                          <div
                            className={`w-5 h-5 rounded transition-all relative cursor-default
                              ${isActive(ratio) ? "hover:scale-125 hover:z-10 hover:shadow-sm" : "opacity-20"}`}
                            key={stat.nodeId}
                            onMouseEnter={(e) => handleMouseEnter(stat, e)}
                            onMouseLeave={handleMouseLeave}
                            onMouseMove={handleMouseMove}
                            style={{ backgroundColor: getColor(ratio) }}
                          />
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      {/* Hover tooltip */}
      {hovered && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2.5 rounded-lg border border-border bg-popover shadow-lg"
          style={{ left: hovered.x + 14, top: hovered.y - 12 }}
        >
          <Typography variant="code">{truncateText(hovered.nodeId)}</Typography>
          <div className="flex flex-col gap-0.5 mt-1">
            <Typography variant="bodyXs">
              {hovered.count} hot key{hovered.count !== 1 ? "s" : ""}
            </Typography>
            <Typography variant="bodyXs">
              {hovered.totalAccess.toLocaleString()} total accesses
            </Typography>
          </div>
        </div>
      )}
    </Dialog.Root>
  )
}
