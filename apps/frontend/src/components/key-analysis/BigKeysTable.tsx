import { useState, useMemo } from "react"
import { BarChart3 } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import { formatBytes } from "@common/src/bytes-conversion"
import { convertTTL } from "@common/src/ttl-conversion"
import { TableContainer } from "@/components/ui/table-container"
import {
  SortableTableHeader,
  StaticTableHeader,
  type SortOrder,
} from "@/components/ui/sortable-table-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChartModal } from "@/components/ui/chart-modal"
import { Typography } from "@/components/ui/typography"
import type { AnalyzedKeyInfo } from "@/state/valkey-features/key-analysis/keyAnalysisSlice"

interface BigKeysTableProps {
  keys: AnalyzedKeyInfo[]
  loading: boolean
}

type SortField = "name" | "type" | "memoryUsage" | "collectionSize" | "ttl"

export function BigKeysTable({ keys, loading }: BigKeysTableProps) {
  const [sortField, setSortField] = useState<SortField>("memoryUsage")
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")
  const [chartOpen, setChartOpen] = useState(false)

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortOrder("desc")
    }
  }

  const sortedKeys = useMemo(() => {
    const multiplier = sortOrder === "asc" ? 1 : -1
    return [...keys].sort((a, b) => {
      switch (sortField) {
        case "name":
          return multiplier * a.name.localeCompare(b.name)
        case "type":
          return multiplier * a.type.localeCompare(b.type)
        case "memoryUsage":
          return multiplier * (a.memoryUsage - b.memoryUsage)
        case "collectionSize":
          return multiplier * ((a.collectionSize ?? 0) - (b.collectionSize ?? 0))
        case "ttl":
          return multiplier * (a.ttl - b.ttl)
        default:
          return 0
      }
    })
  }, [keys, sortField, sortOrder])

  const chartData = useMemo(
    () =>
      keys.slice(0, 20).map((k) => ({
        name: k.name.length > 20 ? k.name.slice(0, 20) + "..." : k.name,
        fullName: k.name,
        memory: k.memoryUsage,
        type: k.type,
      })),
    [keys],
  )

  const header = (
    <div className="flex items-center gap-4 w-full">
      <SortableTableHeader
        active={sortField === "name"}
        label="Key Name"
        onClick={() => handleSort("name")}
        sortOrder={sortOrder}
        width="flex-1 min-w-0"
      />
      <SortableTableHeader
        active={sortField === "type"}
        label="Type"
        onClick={() => handleSort("type")}
        sortOrder={sortOrder}
        width="w-20"
      />
      <SortableTableHeader
        active={sortField === "memoryUsage"}
        label="Memory"
        onClick={() => handleSort("memoryUsage")}
        sortOrder={sortOrder}
        width="w-28"
      />
      <SortableTableHeader
        active={sortField === "collectionSize"}
        label="Size"
        onClick={() => handleSort("collectionSize")}
        sortOrder={sortOrder}
        width="w-20"
      />
      <SortableTableHeader
        active={sortField === "ttl"}
        label="TTL"
        onClick={() => handleSort("ttl")}
        sortOrder={sortOrder}
        width="w-24"
      />
      <StaticTableHeader label="" width="w-10" />
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-2">
        <Typography variant="bodySm" className="text-gray-500">
          {keys.length} keys sorted by memory usage
        </Typography>
        <Button
          disabled={keys.length === 0}
          onClick={() => setChartOpen(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          <BarChart3 size={16} className="mr-1" />
          Chart
        </Button>
      </div>

      <TableContainer header={header}>
        {sortedKeys.map((key) => (
          <tr
            className="border-b dark:border-tw-dark-border hover:bg-primary/10"
            key={key.name}
          >
            <td className="px-4 py-2 truncate max-w-0">
              <Typography variant="bodySm" className="truncate">
                {key.name}
              </Typography>
            </td>
            <td className="px-4 py-2 w-20">
              <Badge variant="secondary">{key.type}</Badge>
            </td>
            <td className="px-4 py-2 w-28">
              <Typography variant="bodySm">{formatBytes(key.memoryUsage)}</Typography>
            </td>
            <td className="px-4 py-2 w-20">
              <Typography variant="bodySm">
                {key.collectionSize !== null ? key.collectionSize.toLocaleString() : "-"}
              </Typography>
            </td>
            <td className="px-4 py-2 w-24">
              <Typography variant="bodySm">{convertTTL(key.ttl)}</Typography>
            </td>
            <td className="px-4 py-2 w-10" />
          </tr>
        ))}
      </TableContainer>

      <ChartModal
        onClose={() => setChartOpen(false)}
        open={chartOpen}
        subtitle="Memory usage of the top 20 keys"
        title="Top Big Keys"
      >
        <ResponsiveContainer height={400} width="100%">
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis
              tickFormatter={(v: number) => formatBytes(v)}
              type="number"
            />
            <YAxis
              dataKey="name"
              tick={{ fontSize: 11 }}
              type="category"
              width={140}
            />
            <Tooltip
              formatter={(value: number) => [formatBytes(value), "Memory"]}
              labelFormatter={(_label: string, payload: Array<{ payload?: { fullName?: string } }>) =>
                payload?.[0]?.payload?.fullName ?? _label
              }
            />
            <Bar dataKey="memory" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartModal>
    </div>
  )
}
