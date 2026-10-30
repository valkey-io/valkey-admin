import { useState } from "react"
import { Link, useParams } from "react-router"
import { Grid2x2X } from "lucide-react"
import { convertTTL } from "@common/src/ttl-conversion"
import { formatBytes } from "@common/src/bytes-conversion"
import { truncateText } from "@common/src/truncate-text"
import { Typography } from "../../ui/typography"
import { EmptyState } from "../../ui/empty-state"
import { TableContainer } from "../../ui/table-container"
import { StaticTableHeader } from "../../ui/sortable-table-header"
import { HeatmapLegend } from "../hotkeys/heatmap-legend"
import { NodeFilterDropdown } from "../hotkeys/node-filter-dropdown"
import { getColor, snapToBucket, toRatio } from "../hotkeys/heatmap-scale"
import type { BigKey } from "@/state/valkey-features/bigkeys/bigKeysSlice"

interface SlotGroup {
  slotId: number
  rows: BigKey[]
  totalBytes: number
  nodeId?: string
}

interface HoveredSlot {
  group: SlotGroup
  x: number
  y: number
}

export interface BigKeysSlotHeatmapProps {
  bigKeys: BigKey[]
  failedNodeCount?: number
  onKeyClick?: (keyName: string) => void
}

const SLOT_INTENSITY_DESCRIPTION =
  "Color shows how many of your scanned big keys each slot holds compared with "
  + "the other slots shown. Darkest means most, lightest means fewest. If all slots hold the same number, "
  + "all are shown darkest."

const groupKeysBySlot = (bigKeys: BigKey[]): SlotGroup[] => {
  const grouped = new Map<number, SlotGroup>()

  for (const row of bigKeys) {
    const { slotId } = row
    if (slotId === undefined || slotId === null) continue

    const group = grouped.get(slotId) ?? {
      slotId,
      rows: [],
      totalBytes: 0,
      nodeId: row.nodeId,
    }
    group.rows.push(row)
    group.totalBytes += row.sizeBytes
    grouped.set(slotId, group)
  }

  return [...grouped.values()].sort(
    (a, b) => b.rows.length - a.rows.length || b.totalBytes - a.totalBytes,
  )
}

function SlotTile({
  group,
  ratio,
  dimmed,
  selected,
  onSelect,
  onHover,
  onMove,
  onLeave,
}: {
  group: SlotGroup
  ratio: number
  dimmed: boolean
  selected: boolean
  onSelect: () => void
  onHover: (e: React.MouseEvent) => void
  onMove: (e: React.MouseEvent) => void
  onLeave: () => void
}) {
  return (
    <button
      className={`flex flex-col items-center justify-center gap-0.5 rounded-md py-3 px-2 transition-all
        ${dimmed ? "opacity-20" : "hover:scale-105 hover:z-10 hover:shadow-sm"}
        ${selected ? "ring-2 ring-offset-1 ring-foreground" : ""}`}
      onClick={onSelect}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onMouseMove={onMove}
      style={{
        backgroundColor: getColor(ratio),
        color: ratio > 0.5 ? "hsl(0, 0%, 100%)" : "hsl(0, 0%, 12%)",
      }}
      type="button"
    >
      <span className="text-sm font-semibold leading-tight">{group.slotId}</span>
      <span className="text-xs leading-tight">
        {group.rows.length} Key{group.rows.length !== 1 ? "s" : ""}
      </span>
    </button>
  )
}

function SlotDetails({
  group,
  totalBigKeys,
  onKeyClick,
}: {
  group: SlotGroup | null
  totalBigKeys: number
  onKeyClick?: (keyName: string) => void
}) {
  const { id, clusterId } = useParams()

  if (!group) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Typography variant="bodySm">Select a slot to see the big keys it holds</Typography>
      </div>
    )
  }

  const nodeLabel = group.nodeId && truncateText(group.nodeId)

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="flex items-baseline justify-between gap-4 px-4 py-3 border-b border-border">
        <Typography variant="label">
          Slot {group.slotId}
          {nodeLabel && (
            <>
              {" "}in Node{" "}
              {clusterId ? (
                <Link className="underline hover:text-primary" to={`/${clusterId}/${id}/cluster-topology`}>
                  {nodeLabel}
                </Link>
              ) : (
                nodeLabel
              )}
            </>
          )}
        </Typography>
        <Typography className="shrink-0" variant="bodyXs">
          {group.rows.length} of your top {totalBigKeys} big key{totalBigKeys !== 1 ? "s" : ""}
        </Typography>
      </header>

      <TableContainer
        className="min-h-0"
        header={
          <>
            <StaticTableHeader label="Key Name" width="w-1/2" />
            <StaticTableHeader className="text-center" label="Type" width="w-1/6" />
            <StaticTableHeader className="text-center" label="Size" width="w-1/6" />
            <StaticTableHeader className="text-center" label="TTL" width="w-1/6" />
          </>
        }
      >
        {group.rows.map((entry, index) => (
          <tr
            className="border-b dark:border-tw-dark-border cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800/50"
            key={`${entry.key}-${index}`}
            onClick={() => onKeyClick?.(entry.key)}
            onKeyDown={(e) => e.key === "Enter" && onKeyClick?.(entry.key)}
            tabIndex={0}
          >
            <td className="px-4 py-2 w-1/2 max-w-0">
              <Typography className="block truncate" variant="code">{entry.key}</Typography>
            </td>
            <td className="px-4 py-2 w-1/6 text-center">
              <Typography variant="code">{entry.type}</Typography>
            </td>
            <td className="px-4 py-2 w-1/6 text-center">
              <Typography variant="bodySm">{formatBytes(entry.sizeBytes)}</Typography>
            </td>
            <td className="px-4 py-2 w-1/6 text-center">
              <Typography className="whitespace-nowrap" variant="bodySm">{convertTTL(entry.ttl)}</Typography>
            </td>
          </tr>
        ))}
      </TableContainer>
    </div>
  )
}

export function BigKeysSlotHeatmap({
  bigKeys,
  failedNodeCount = 0,
  onKeyClick,
}: BigKeysSlotHeatmapProps) {
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null)
  const [selectedNode, setSelectedNode] = useState("all")
  const [selectedBuckets, setSelectedBuckets] = useState<Set<number>>(new Set())
  const [hovered, setHovered] = useState<HoveredSlot | null>(null)

  const allGroups = groupKeysBySlot(bigKeys)

  if (allGroups.length === 0) {
    return (
      <EmptyState
        icon={<Grid2x2X size={48} />}
        title="No Big Key Slots Found"
      />
    )
  }

  const nodes = [
    ...new Set(allGroups.map((group) => group.nodeId).filter((nodeId) => nodeId !== undefined)),
  ].sort() as string[]

  const activeNode = nodes.includes(selectedNode) ? selectedNode : "all"
  const groups = activeNode === "all"
    ? allGroups
    : allGroups.filter((group) => group.nodeId === activeNode)

  const max = groups[0].rows.length
  const min = groups.at(-1)!.rows.length
  const totalBigKeys = groups.reduce((sum, group) => sum + group.rows.length, 0)

  const handleNodeSelect = (node: string) => {
    setSelectedNode(node)
    setSelectedSlotId(null)
  }

  const hasBucketFilter = selectedBuckets.size > 0
  const isActive = (ratio: number) => !hasBucketFilter || selectedBuckets.has(snapToBucket(ratio))

  const toggleBucket = (step: number) => {
    setSelectedBuckets((prev) => {
      const next = new Set(prev)
      if (next.has(step)) { next.delete(step) } else { next.add(step) }
      return next
    })
  }

  const selectedGroup = groups.find((group) => group.slotId === selectedSlotId) ?? null

  const chips = [
    `${groups.length} slot${groups.length !== 1 ? "s" : ""}`,
    `${totalBigKeys} big key${totalBigKeys !== 1 ? "s" : ""}`,
  ]

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      <div className="flex items-center gap-2 flex-wrap">
        {chips.map((chip) => (
          <span
            className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 border border-primary/20"
            key={chip}
          >
            <Typography variant="bodyXs">{chip}</Typography>
          </span>
        ))}
        {nodes.length > 0 && (
          <NodeFilterDropdown
            allLabel={`${nodes.length} node${nodes.length !== 1 ? "s" : ""}`}
            className="w-auto h-7 rounded-full px-3 py-1 text-xs font-normal bg-primary/10 border-primary/20 dark:bg-primary/10"
            nodes={nodes}
            onSelect={handleNodeSelect}
            selectedNode={activeNode}
          />
        )}
        {failedNodeCount > 0 && (
          <Typography className="text-destructive" variant="bodyXs">
            Partial — {failedNodeCount} node{failedNodeCount !== 1 ? "s" : ""} failed to report
          </Typography>
        )}
      </div>

      <HeatmapLegend
        description={SLOT_INTENSITY_DESCRIPTION}
        label="Select one or multiple legends to filter slots by big key concentration"
        onToggle={toggleBucket}
        selectedBuckets={selectedBuckets}
      />

      <div className="flex-1 flex gap-4 min-h-0">
        <section className="w-1/2 flex flex-col gap-2 min-h-0">
          <div className="flex-1 rounded-lg border border-border p-4 overflow-y-auto min-h-0">
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {groups.map((group) => {
                const ratio = toRatio(group.rows.length, min, max)
                return (
                  <SlotTile
                    dimmed={!isActive(ratio)}
                    group={group}
                    key={`${group.nodeId ?? "unknown"}-${group.slotId}`}
                    onHover={(e) => setHovered({ group, x: e.clientX, y: e.clientY })}
                    onLeave={() => setHovered(null)}
                    onMove={(e) => setHovered((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
                    onSelect={() => setSelectedSlotId(group.slotId)}
                    ratio={ratio}
                    selected={selectedSlotId === group.slotId}
                  />
                )
              })}
            </div>
          </div>
          <Typography variant="bodyXs">
            Shows the slots holding your top {totalBigKeys} big key{totalBigKeys !== 1 ? "s" : ""}, not every slot in the cluster.
          </Typography>
        </section>

        <section className="w-1/2 flex flex-col rounded-lg border border-border min-h-0">
          <SlotDetails group={selectedGroup} onKeyClick={onKeyClick} totalBigKeys={totalBigKeys} />
        </section>
      </div>

      {hovered && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2.5 rounded-lg border border-border bg-popover shadow-lg"
          style={{ left: hovered.x + 14, top: hovered.y - 12 }}
        >
          <Typography variant="code">Slot {hovered.group.slotId}</Typography>
          <div className="flex flex-col gap-0.5 mt-1">
            <Typography variant="bodyXs">
              {hovered.group.rows.length} of your top {totalBigKeys} big key{totalBigKeys !== 1 ? "s" : ""}
            </Typography>
            <Typography variant="bodyXs">
              {formatBytes(hovered.group.totalBytes)} total
            </Typography>
            <Typography variant="bodyXs">
              {truncateText(hovered.group.nodeId ?? "—")}
            </Typography>
          </div>
        </div>
      )}
    </div>
  )
}
