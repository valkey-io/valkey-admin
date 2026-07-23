import { useMemo, useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts"
import { KeyRound, Server, X } from "lucide-react"
import { truncateText } from "@common/src/truncate-text"
import { formatBytes } from "@common/src/bytes-conversion"
import { Typography } from "../../ui/typography"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { TabGroup, type TabOption } from "../../ui/tab-group"
import type { BigKey } from "@/state/valkey-features/bigkeys/bigKeysSlice"

interface BigKeysDistributionModalProps {
  open: boolean
  onClose: () => void
  data: BigKey[]
}

// switch between key count and byte size
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

// we show the top N filter only if there are more than this many nodes
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

export function BigKeysDistributionModal({ open, onClose, data }: BigKeysDistributionModalProps) {
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
    <Dialog.Root onOpenChange={onClose} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-black/50" />
        <Dialog.Content asChild>
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
            <div className="w-1/2 h-1/2 bg-background rounded-xl border border-border shadow-xl flex flex-col">

              {/* top header */}
              <div className="flex flex-col gap-3 px-6 py-4 border-b border-border">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <Dialog.Title asChild>
                      <Typography variant="subheading">Big Keys Distribution</Typography>
                    </Dialog.Title>
                    <Dialog.Description asChild>
                      <Typography variant="bodyXs">
                        {metric === "totalBytes" ? "Big key size per cluster node" : "Big key count per cluster node"}
                      </Typography>
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <Button className="hover:text-primary p-1 shrink-0 -mt-1 -mr-1" size="sm" variant="ghost">
                      <X size={16} />
                    </Button>
                  </Dialog.Close>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <TabGroup activeTab={metric} onChange={setMetric} tabs={METRIC_TABS} />
                  {showTopN && (
                    <div className="flex items-center gap-1.5">
                      <Typography variant="bodySm">Nodes :</Typography>
                      <Input
                        className="h-8 w-20"
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

              {/* body */}
              <div className="flex-1 flex flex-col gap-5 px-6 py-5 overflow-y-auto min-h-0">
                <div className="flex items-center justify-between gap-2">
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
                </div>

                {/* chart */}
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
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
