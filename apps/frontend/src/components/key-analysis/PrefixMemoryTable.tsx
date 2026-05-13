import { useState, useMemo } from "react"
import { PieChart as RechartsPieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"
import { formatBytes } from "@common/src/bytes-conversion"
import { TableContainer } from "@/components/ui/table-container"
import {
  SortableTableHeader,
  type SortOrder,
} from "@/components/ui/sortable-table-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChartModal } from "@/components/ui/chart-modal"
import { Typography } from "@/components/ui/typography"
import type { AnalyzedKeyInfo } from "@/state/valkey-features/key-analysis/keyAnalysisSlice"

interface PrefixAggregation {
  prefix: string
  totalMemory: number
  keyCount: number
  percentageOfTotal: number
  typeBreakdown: Record<string, number>
}

interface PrefixMemoryTableProps {
  keys: AnalyzedKeyInfo[]
  totalMemory: number
}

type SortField = "prefix" | "totalMemory" | "keyCount" | "percentageOfTotal"

const CHART_COLORS = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)",
  "var(--chart-4)", "var(--chart-5)", "var(--chart-6)", "var(--chart-7)",
]

function groupByPrefix(keys: AnalyzedKeyInfo[], segmentCount: number): PrefixAggregation[] {
  const groups: Record<string, PrefixAggregation> = {}

  for (const key of keys) {
    const delimiter = key.name.includes(":") ? ":" : key.name.includes(".") ? "." : ":"
    const segments = key.name.split(delimiter)
    const prefix = segments.slice(0, Math.min(segmentCount, segments.length)).join(delimiter)

    if (!groups[prefix]) {
      groups[prefix] = { prefix, totalMemory: 0, keyCount: 0, percentageOfTotal: 0, typeBreakdown: {} }
    }
    groups[prefix].totalMemory += key.memoryUsage
    groups[prefix].keyCount += 1
    groups[prefix].typeBreakdown[key.type] = (groups[prefix].typeBreakdown[key.type] || 0) + 1
  }

  const grandTotal = Object.values(groups).reduce((sum, g) => sum + g.totalMemory, 0)
  for (const g of Object.values(groups)) {
    g.percentageOfTotal = grandTotal > 0 ? (g.totalMemory / grandTotal) * 100 : 0
  }

  return Object.values(groups).sort((a, b) => b.totalMemory - a.totalMemory)
}

export function PrefixMemoryTable({ keys, totalMemory }: PrefixMemoryTableProps) {
  const [sortField, setSortField] = useState<SortField>("totalMemory")
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")
  const [segmentDepth, setSegmentDepth] = useState(1)
  const [chartOpen, setChartOpen] = useState(false)

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortOrder("desc")
    }
  }

  const aggregated = useMemo(
    () => groupByPrefix(keys, segmentDepth),
    [keys, segmentDepth],
  )

  const sorted = useMemo(() => {
    const multiplier = sortOrder === "asc" ? 1 : -1
    return [...aggregated].sort((a, b) => {
      switch (sortField) {
        case "prefix":
          return multiplier * a.prefix.localeCompare(b.prefix)
        case "totalMemory":
          return multiplier * (a.totalMemory - b.totalMemory)
        case "keyCount":
          return multiplier * (a.keyCount - b.keyCount)
        case "percentageOfTotal":
          return multiplier * (a.percentageOfTotal - b.percentageOfTotal)
        default:
          return 0
      }
    })
  }, [aggregated, sortField, sortOrder])

  const chartData = useMemo(
    () => aggregated.slice(0, 15).map((g) => ({
      name: g.prefix,
      value: g.totalMemory,
    })),
    [aggregated],
  )

  const header = (
    <div className="flex items-center gap-4 w-full">
      <SortableTableHeader
        active={sortField === "prefix"}
        label="Prefix"
        onClick={() => handleSort("prefix")}
        sortOrder={sortOrder}
        width="flex-1 min-w-0"
      />
      <SortableTableHeader
        active={sortField === "totalMemory"}
        label="Total Memory"
        onClick={() => handleSort("totalMemory")}
        sortOrder={sortOrder}
        width="w-28"
      />
      <SortableTableHeader
        active={sortField === "keyCount"}
        label="Keys"
        onClick={() => handleSort("keyCount")}
        sortOrder={sortOrder}
        width="w-20"
      />
      <SortableTableHeader
        active={sortField === "percentageOfTotal"}
        label="% Total"
        onClick={() => handleSort("percentageOfTotal")}
        sortOrder={sortOrder}
        width="w-20"
      />
      <div className="w-40 text-xs font-bold">Types</div>
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-2">
        <Typography variant="bodySm" className="text-gray-500">
          {aggregated.length} prefixes found
        </Typography>
        <div className="flex items-center gap-2">
          <Typography variant="bodySm" className="text-gray-500">
            Depth:
          </Typography>
          {[1, 2, 3].map((d) => (
            <Button
              key={d}
              onClick={() => setSegmentDepth(d)}
              size="sm"
              type="button"
              variant={segmentDepth === d ? "default" : "outline"}
            >
              {d}
            </Button>
          ))}
          <Button
            disabled={aggregated.length === 0}
            onClick={() => setChartOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            Chart
          </Button>
        </div>
      </div>

      <TableContainer header={header}>
        {sorted.map((group) => (
          <tr
            className="border-b dark:border-tw-dark-border hover:bg-primary/10"
            key={group.prefix}
          >
            <td className="px-4 py-2 truncate max-w-0">
              <Typography variant="bodySm" className="truncate font-medium">
                {group.prefix}
              </Typography>
            </td>
            <td className="px-4 py-2 w-28">
              <Typography variant="bodySm">{formatBytes(group.totalMemory)}</Typography>
            </td>
            <td className="px-4 py-2 w-20">
              <Typography variant="bodySm">{group.keyCount.toLocaleString()}</Typography>
            </td>
            <td className="px-4 py-2 w-20">
              <Typography variant="bodySm">{group.percentageOfTotal.toFixed(1)}%</Typography>
            </td>
            <td className="px-4 py-2 w-40">
              <div className="flex flex-wrap gap-1">
                {Object.entries(group.typeBreakdown).map(([type, count]) => (
                  <Badge key={type} variant="secondary">
                    {type}: {count}
                  </Badge>
                ))}
              </div>
            </td>
          </tr>
        ))}
      </TableContainer>

      <ChartModal
        onClose={() => setChartOpen(false)}
        open={chartOpen}
        subtitle="Memory distribution by key prefix"
        title="Prefix Memory Distribution"
      >
        <ResponsiveContainer height={400} width="100%">
          <RechartsPieChart>
            <Pie
              data={chartData}
              dataKey="value"
              innerRadius={100}
              label={({ name, percent }: { name: string; percent: number }) =>
                `${name} (${(percent * 100).toFixed(0)}%)`
              }
              nameKey="name"
              outerRadius={140}
              paddingAngle={2}
            >
              {chartData.map((_entry, index) => (
                <Cell
                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                  key={`cell-${index}`}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [formatBytes(value), "Memory"]}
            />
          </RechartsPieChart>
        </ResponsiveContainer>
      </ChartModal>
    </div>
  )
}
