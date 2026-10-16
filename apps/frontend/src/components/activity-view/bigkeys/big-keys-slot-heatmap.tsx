import React, { useState } from "react"
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

interface BigKeysSlotGroup {
  slotId: number
  rows: BigKey[]
  totalBytes: number
  nodeId?: string
}

interface HoveredSlot {
  group: BigKeysSlotGroup
  x: number
  y: number
}

interface BigKeysSlotHeatmapProps {
  bigKeys: BigKey[]
  failedNodeCount?: number
  onKeyClick?: (keyName: string) => void
}

const SLOT_INTENSITY_DESCRIPTION =
  "Color shows how many of your scanned big keys each slot holds compared with the other slots shown. " +
  "Darkest means most, lightest means fewest. If all slots hold the same number, all are shown darkest."

const groupBigKeysBySlot = (keys: BigKey[]): BigKeysSlotGroup[] => {
  const grouped = new Map<number, BigKeysSlotGroup>()

  for (const item of keys) {
    const slotId = item.slotId
    if (slotId === undefined || slotId === null) continue

    const group = grouped.get(slotId) ?? {
      slotId,
      rows: [],
      totalBytes: 0,
      nodeId: item.nodeId,
    }
    group.rows.push(item)
    group.totalBytes += item.sizeBytes
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
  group: BigKeysSlotGroup
  ratio: number
  dimmed: boolean
  selected: boolean
  onSelect: () => void
  onHover: (e: React.MouseEvent) => void
  onMove: (e: React.MouseEvent) => void
  onLeave: () => void
}) {
  const color = getColor(ratio)
  const isDark = ratio >= 0.5

  return (
    <button
      aria-label={`Slot ${group.slotId}, ${group.rows.length} big keys`}
      className={`relative h-14 rounded-md flex flex-col items-center justify-center p-1.5 transition-all text-xs border ${
        selected ? "ring-2 ring-primary ring-offset-1 border-primary" : "border-transparent"
      } ${dimmed ? "opacity-20" : "opacity-100"}`}
      onClick={onSelect}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onMouseMove={onMove}
      style={{ backgroundColor: color }}
      type="button"
    >
      <span className={`font-mono font-medium leading-none ${isDark ? "text-white" : "text-black"}`}>
        {group.slotId}
      </span>
      <span className={`text-[10px] opacity-75 mt-0.5 leading-none ${isDark ? "text-white" : "text-black"}`}>
        {group.rows.length} key{group.rows.length !== 1 ? "s" : ""}
      </span>
    </button>
  )
}

function SlotDetails({
  group,
  totalBigKeys,
  onKeyClick,
}: {
  group: BigKeysSlotGroup | null
  totalBigKeys: number
  onKeyClick?: (keyName: string) => void
}) {
  const { clusterId, id } = useParams()

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
        <div className="flex items-center gap-3">
          <Typography className="shrink-0 text-muted-foreground" variant="bodyXs">
            {formatBytes(group.totalBytes)} total
          </Typography>
          <Typography className="shrink-0" variant="bodyXs">
            {group.rows.length} of {totalBigKeys} big key{totalBigKeys !== 1 ? "s" : ""}
          </Typography>
        </div>
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
  const [selectedBuckets, setSelectedBuckets] = useState<Set<number>>(new Set())
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null)
  const [selectedNode, setSelectedNode] = useState("all")
  const [hovered, setHovered] = useState<HoveredSlot | null>(null)

  const allGroups = groupBigKeysBySlot(bigKeys)

  if (allGroups.length === 0) {
    return (
      <EmptyState
        icon={<Grid2x2X size={48} />}
        title="No Slot Data Found"
      />
    )
  }

  const nodes = [
    ...new Set(allGroups.map((group) => group.nodeId).filter((nodeId): nodeId is string => Boolean(nodeId))),
  ].sort()

  const activeNode = nodes.includes(selectedNode) ? selectedNode : "all"
  const groups = activeNode === "all"
    ? allGroups
    : allGroups.filter((group) => group.nodeId === activeNode)

  const max = groups.length > 0 ? groups[0].rows.length : 1
  const min = groups.length > 0 ? groups.at(-1)!.rows.length : 0
  const totalBigKeys = groups.reduce((sum, group) => sum + group.rows.length, 0)
  const totalSizeBytes = groups.reduce((sum, group) => sum + group.totalBytes, 0)

  const handleNodeSelect = (node: string) => {
    setSelectedNode(node)
    setSelectedSlotId(null)
  }

  const hasBucketFilter = selectedBuckets.size > 0
  const isActive = (ratio: number) => !hasBucketFilter || selectedBuckets.has(snapToBucket(ratio))

  const toggleBucket = (step: number) => {
    setSelectedBuckets((prev) => {
      const next = new Set(prev)
      if (next.has(step)) {
        next.delete(step)
      } else {
        next.add(step)
      }
      return next
    })
  }

  const selectedGroup = groups.find((group) => group.slotId === selectedSlotId) ?? null

  const chips = [
    `${groups.length} slot${groups.length !== 1 ? "s" : ""}`,
    `${totalBigKeys} big key${totalBigKeys !== 1 ? "s" : ""}`,
    `${formatBytes(totalSizeBytes)} total`,
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
            Shows the slots holding your {totalBigKeys} scanned big key{totalBigKeys !== 1 ? "s" : ""}, not every slot in the cluster.
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
              {hovered.group.rows.length} big key{hovered.group.rows.length !== 1 ? "s" : ""} ({formatBytes(hovered.group.totalBytes)})
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
