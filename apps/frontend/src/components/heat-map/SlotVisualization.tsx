import { useMemo, useState } from "react"
import { KeyDetailsModal } from "./KeyDetailsModal"
import {formatBytes} from "@common/src/bytes-conversion"
import { HEAT_COLORS } from "@common/src/constants"

// Types
interface SlotData {
  slotNumber: string
  keys: Record<string, number>
  totalAccessCount: number
}

interface NodeWithSlots {
  connectionId: string
  slotData: SlotData[]
}

type NodeInput = {
  connectionId: string
  slots: Record<string, { keys: Record<string, number> }>
}

interface HeatMapVisualizationProps {
  data: readonly NodeInput[]
  type: 'hot' | 'large'
  metricLabel: string
  metricUnit?: string
  clusterId?: string
}

export function SlotVisualization({ data, type, metricLabel, metricUnit }: HeatMapVisualizationProps) {
  // Transform slots data to include total access count per slot
  const transformedNodes: NodeWithSlots[] = useMemo(() =>
    data.map(node => ({
      connectionId: node.connectionId,
      slotData: Object.entries(node.slots).map(([slotNumber, slotInfo]) => ({
        slotNumber,
        keys: slotInfo.keys as Record<string, number>,
        totalAccessCount: Object.values(slotInfo.keys).reduce((sum: number, count) => sum + (count as number), 0)
      }))
    })),
    [data]
  )

  // Calculate range based on total access counts per slot
  const range = useMemo(() =>
    transformedNodes
      .flatMap(node => node.slotData.map(slot => slot.totalAccessCount))
      .sort((a, b) => b - a),
    [transformedNodes]
  )

  const { keyMin, keyMax } = useMemo(() => {
    const keyAccessCounts = transformedNodes
      .flatMap(node => node.slotData.flatMap(slot => Object.values(slot.keys)))
    return {
      keyMin: Math.min(...keyAccessCounts),
      keyMax: Math.max(...keyAccessCounts)
    }
  }, [transformedNodes])

  const min = useMemo(() => Math.min(...range), [range])
  const max = useMemo(() => Math.max(...range), [range])

  const getColorIndex = (accessCount: number): number => {
    const rangeSpan = max - min
    const normalized = rangeSpan === 0 ? 0 : (accessCount - min) / rangeSpan
    return Math.min(Math.floor(normalized * HEAT_COLORS.length), HEAT_COLORS.length - 1)
  }

  const getColor = (accessCount: number): string => {
    return HEAT_COLORS[getColorIndex(accessCount)]
  }

  const legendItems = useMemo(() => {
    const rangeSpan = max - min
    return HEAT_COLORS.map((color, index) => {
      const lowerBound = Math.round(min + (index / HEAT_COLORS.length) * rangeSpan)
      const upperBound = Math.round(min + ((index + 1) / HEAT_COLORS.length) * rangeSpan)
      const formattedRange = type === 'large'
        ? `${formatBytes(lowerBound)} - ${formatBytes(upperBound)}`
        : `${lowerBound}-${upperBound}`
      return {
        color,
        range: formattedRange
      }
    })
  }, [min, max, type])

  const [selectedSlot, setSelectedSlot] = useState<{
    slotNumber: string
    keys: Record<string, number>
    totalAccessCount: number
    node: string
  } | null>(null)

  return (
    <>
      <div className="mt-4 space-y-6">
          {/* Legend */}
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <span className="text-xs text-tw-dark-muted">{metricUnit === "accesses" ? "Slot Access" : "Slot Size"}:</span>
            {legendItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <div
                  className="w-4 h-4 rounded border border-tw-dark-border"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs text-tw-dark-muted whitespace-nowrap">{item.range}</span>
              </div>
            ))}
          </div>
        {/* Node Grid */}
        <div className="flex flex-wrap gap-4">
          {transformedNodes.map((node) => (
            <div
              className="dark:bg-tw-dark-primary bg-gray-50 border dark:border-tw-dark-border rounded-lg p-3 w-[15rem] h-[11rem]"
              key={node.connectionId}
            >
              <h3 className="text-sm font-semibold text-tw-dark-text mb-2">
                Node {node.connectionId}
              </h3>

              {/* 10x5 Grid: each slot is 1rem x 1rem with 0.5rem (2 in Tailwind) gap */}
              <div className="grid grid-cols-10 gap-2 auto-rows-[1rem]">
                {node.slotData.map((slot, idx) => (
                  <div
                    className="group relative rounded cursor-pointer transition-transform hover:scale-110 hover:z-10"
                    style={{ backgroundColor: getColor(slot.totalAccessCount) }}
                    key={idx}
                    onClick={() => setSelectedSlot({
                      slotNumber: slot.slotNumber,
                      keys: slot.keys,
                      totalAccessCount: slot.totalAccessCount,
                      node: node.connectionId,
                    })}
                  >
                    {/* Tooltip */}
                    <div className="
                      absolute bottom-full left-1/2 -translate-x-1/2 mb-2
                      px-2 py-1 bg-gray-900 text-white text-xs rounded
                      whitespace-nowrap opacity-0 group-hover:opacity-100
                      transition-opacity pointer-events-none
                      z-20 shadow-lg
                    ">
                      <div className="font-mono font-semibold">Slot {slot.slotNumber}</div>
                      <div className="text-gray-300">{metricLabel}: {slot.totalAccessCount}</div>
                      <div className="text-gray-300">Keys: {Object.keys(slot.keys).length}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <KeyDetailsModal
        selectedSlot={selectedSlot}
        onClose={() => setSelectedSlot(null)}
        min={keyMin}
        max={keyMax}
        metricLabel={metricLabel}
        metricUnit={metricUnit}
      />
    </>
  )
}


