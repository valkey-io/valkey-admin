import { useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts"
import { KeyRound, Server } from "lucide-react"
import { truncateText } from "@common/src/truncate-text"
import { formatBytes } from "@common/src/bytes-conversion"
import { Typography } from "../../ui/typography"
import { Input } from "../../ui/input"
import { TabGroup, type TabOption } from "../../ui/tab-group"
import type { BigKey } from "@/state/valkey-features/bigkeys/bigKeysSlice"

interface BigKeysDistributionContentProps {
  data: BigKey[]
}

type Metric = "count" | "totalBytes"

interface NodeStat {
  nodeId: string
  count: number
  totalBytes: number
}

const METRIC_TABS: TabOption<Metric>[] = [
  { id: "count", label: "Keys" },
  { id: "totalBytes", label: "Size" },
]

const TOP_N_MIN_NODES = 20

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: NodeStat }>
}

function DistributionTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const { nodeId, count, totalBytes } = payload[0].payload
  return (
    <div className="px-3 py-2.5 rounded-lg border border-border bg-popover shadow-lg">
      <Typography variant="code">{truncateText(nodeId)}</Typography>
      <div className="flex flex-col gap-0.5 mt-1">
        <Typography variant="bodyXs">
          {count} big key{count !== 1 ? "s" : ""}
        </Typography>
        <Typography variant="bodyXs">{formatBytes(totalBytes)} total</Typography>
      </div>
    </div>
  )
}

export function BigKeysDistributionContent({ data }: BigKeysDistributionContentProps) {
  const [metric, setMetric] = useState<Metric>("count")
  const [topN, setTopN] = useState("")

  const sorted = useMemo(() => {
    const nodeStats = data.reduce((acc, { nodeId, sizeBytes }) => {
      const key = nodeId ?? "Unknown"
      acc[key] ??= { nodeId: key, count: 0, totalBytes: 0 }
      acc[key].count += 1
      acc[key].totalBytes += sizeBytes
      return acc
    }, {} as Record<string, NodeStat>)

    return Object.values(nodeStats).sort((a, b) => b[metric] - a[metric])
  }, [data, metric])

  const limit = Number.parseInt(topN, 10)
  const visible = limit > 0 ? sorted.slice(0, limit) : sorted
  const showTopN = sorted.length > TOP_N_MIN_NODES

  return (
    <div className="flex-1 flex flex-col gap-5 min-h-0">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
            <Server className="text-primary" size={12} />
            <Typography variant="bodyXs">
              {sorted.length} node{sorted.length !== 1 ? "s" : ""}
            </Typography>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
            <KeyRound className="text-primary" size={12} />
            <Typography variant="bodyXs">
              {data.length} big key{data.length !== 1 ? "s" : ""}
            </Typography>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <TabGroup activeTab={metric} onChange={setMetric} tabs={METRIC_TABS} />
          {showTopN && (
            <div className="flex items-center gap-2">
              <Typography className="text-muted-foreground whitespace-nowrap" variant="bodyXs">
                Top nodes
              </Typography>
              <Input
                aria-label="Filter top nodes"
                className="w-16 h-8 text-xs text-center"
                max={sorted.length}
                min={1}
                onChange={(e) => setTopN(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="All"
                type="number"
                value={topN}
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={visible} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="nodeId" tick={false} tickLine={false} type="category" />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              tickFormatter={metric === "totalBytes" ? formatBytes : undefined}
              type="number"
              width={metric === "totalBytes" ? 60 : 36}
            />
            <Tooltip content={<DistributionTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
            <Bar dataKey={metric} fill="var(--chart-1)" maxBarSize={64} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
