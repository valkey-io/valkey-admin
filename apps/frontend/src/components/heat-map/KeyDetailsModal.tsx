import { X } from "lucide-react"
import {formatBytes} from "@common/src/bytes-conversion"
import { HEAT_COLORS } from "@common/src/constants"

interface KeyDetailsModalProps {
  selectedSlot: {
    slotNumber: string
    keys: Record<string, number>
    totalAccessCount: number
    node: string
  } | null
  onClose: () => void
  min: number
  max: number
  metricLabel: string
  metricUnit?: string
}

export function KeyDetailsModal({
  selectedSlot,
  onClose,
  min,
  max,
  metricLabel,
  metricUnit,
}: KeyDetailsModalProps) {
  if (!selectedSlot) return null

  // Calculate color based on key-level min/max
  const getKeyColor = (accessCount: number): string => {
    const rangeSpan = max - min
    const normalized = rangeSpan === 0 ? 0 : (accessCount - min) / rangeSpan
    const index = Math.min(Math.floor(normalized * HEAT_COLORS.length), HEAT_COLORS.length - 1)
    return HEAT_COLORS[index]
  }

  // Generate legend items for key-level ranges
  const keyLegendItems = (() => {
    const rangeSpan = max - min
    return HEAT_COLORS.map((color, index) => {
      const lowerBound = Math.round(min + (index / HEAT_COLORS.length) * rangeSpan)
      const upperBound = Math.round(min + ((index + 1) / HEAT_COLORS.length) * rangeSpan)
      const formattedRange = metricUnit === "accesses"
        ? `${lowerBound}-${upperBound}`
        : `${formatBytes(lowerBound)} - ${formatBytes(upperBound)}`
      return {
        color,
        range: formattedRange
      }
    })
  })()

  // sort to show hottest keys first
  const keyEntries = Object.entries(selectedSlot.keys).sort(([, a], [, b]) => b - a)

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="max-w-4xl w-full p-6 bg-white dark:bg-tw-dark-primary dark:border-tw-dark-border rounded-lg shadow-lg border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Slot Details</h2>
            <p className="text-sm text-tw-primary mt-1">
              Slot {selectedSlot.slotNumber} of Node {selectedSlot.node}
            </p>
          </div>
          <button
            className="text-tw-primary hover:text-tw-primary/60"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Total {metricLabel}
            </label>
            <div className="text-sm bg-tw-primary/10 p-3 rounded border">
              {metricUnit === "accesses" ? selectedSlot.totalAccessCount : formatBytes(selectedSlot.totalAccessCount)}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-medium text-tw-dark-border">
                Keys in this Slot ({keyEntries.length})
              </label>

              {/* Key-level Legend */}
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <span className="text-xs text-tw-dark-muted">{metricLabel}:</span>
                {keyLegendItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <div
                      className="w-4 h-4 rounded border border-tw-dark-border"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-xs text-tw-dark-muted whitespace-nowrap">
                      {item.range}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="overflow-auto max-h-96 rounded border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-semibold  border-b border-gray-200">
                      Key Name
                    </th>
                    <th className="text-right p-3 font-semibold  border-b border-gray-200">
                      {metricLabel}
                    </th>
                    <th className="text-center p-3 font-semibold border-b border-gray-200">
                      {metricUnit === "accesses" ? "Heat Level" : "Size Level"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {keyEntries.map(([keyName, accessCount], idx) => {
                    const heatColor = getKeyColor(accessCount)
                    // example : min=1, max=612, accessCount=306 then (306-1)/(612-1) * 100 = 49.9%
                    const heatPercent = ((accessCount - min) / (max - min) * 100).toFixed(1)
                    return (
                      <tr
                        key={idx}
                        className="border-b last:border-b-0 transition-colors"
                      >
                        <td className="p-3 font-mono">
                          {keyName}
                        </td>
                        <td className="p-3 text-right font-medium">
                          {metricUnit === "accesses" ? accessCount : formatBytes(accessCount)}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-2">
                            <div
                              className="w-6 h-6 rounded border-2 border-gray-300"
                              style={{ backgroundColor: heatColor }}
                            />
                            <span className="text-xs">
                              {heatPercent}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
