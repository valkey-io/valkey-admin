import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { useParams } from "react-router"
import { formatBytes } from "@common/src/bytes-conversion"
import { Search, Maximize2 } from "lucide-react"
import AreaChartComponent from "../ui/area-chart"
import { ButtonGroup } from "../ui/button-group"
import { ChartTile } from "../ui/chart-tile"
import { ChartModal } from "../ui/chart-modal"
import { Input } from "../ui/input"
import { Typography } from "../ui/typography"
import { cpuUsageRequested, selectCpuUsage } from "@/state/valkey-features/cpu/cpuSlice.ts"
import { useAppDispatch } from "@/hooks/hooks"
import { memoryUsageRequested, selectMemoryUsage } from "@/state/valkey-features/memory/memorySlice"

const colors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

type ChartType = "cpu" | { type: "memory"; key: string }

export default function CpuMemoryUsage() {
  const { id, clusterId } = useParams()
  const dispatch = useAppDispatch()
  const cpuUsageData = useSelector(selectCpuUsage(id ?? ""))
  const memoryUsageData = useSelector(selectMemoryUsage(id ?? ""))
  const [cpuTimeRange, setCpuTimeRange] = useState("1h")
  const [memoryTimeRange, setMemoryTimeRange] = useState("1h")
  const [openChart, setOpenChart] = useState<ChartType | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  // for cpu
  useEffect(() => {
    if (id) {
      dispatch(cpuUsageRequested({ connectionId: id, clusterId, timeRange: cpuTimeRange }))
    }
  }, [id, clusterId, dispatch, cpuTimeRange])

  // for memory
  useEffect(() => {
    if (id) {
      dispatch(memoryUsageRequested({ connectionId: id, clusterId, timeRange: memoryTimeRange }))
    }
  }, [id, clusterId, dispatch, memoryTimeRange])

  const memoryMetrics = memoryUsageData ? Object.entries(memoryUsageData) : []

  // format metric name
  const formatMetricName = (key: string) => {
    const formatted = key
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")

    // Replace outdated terminology
    return formatted.replace(/\bSlave(s)?\b/g, "Replica$1")
  }

  // format metric unit
  const formatMetricUnit = (key: string) => {
    const k = key.toLowerCase()
    return k.includes("bytes") ? "(bytes)"
      : k.includes("percentage") ? "(%)"
        : k.includes("ratio") ? "(ratio)"
          : "count"
  }

  // format y-axis value
  const getValueFormatter = (key: string) => {
    if (key.toLowerCase().includes("bytes")) {
      return (value: number) => formatBytes(value)
    }
    return undefined
  }

  // filtering charts based on search
  const filteredCharts: Array<{ id: string; title: string; subtitle: string; chartType: ChartType }> = []

  // for cpu chart
  if ("cpu usage".includes(searchQuery.toLowerCase()) || searchQuery === "") {
    filteredCharts.push({
      id: "cpu",
      title: "CPU Usage Over Time",
      subtitle: "Real-time CPU utilization monitoring",
      chartType: "cpu",
    })
  }

  // for memory chart
  memoryMetrics.forEach(([key, metric]) => {
    const title = formatMetricName(key)
    if (
      title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      metric?.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      searchQuery === ""
    ) {
      filteredCharts.push({
        id: key,
        title,
        subtitle: metric?.description || "Memory usage monitoring",
        chartType: { type: "memory", key },
      })
    }
  })

  const hasNoData = (!cpuUsageData || cpuUsageData.length === 0) && memoryMetrics.length === 0

  return (
    <div className="flex-1 border border-input rounded-md shadow-xs p-4 mt-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          <Typography variant="subheading">Metrics and Anomaly Detection</Typography>
          {!hasNoData &&
            <Typography className="flex items-center gap-1" variant="caption">
              (Click <Maximize2 size={12} /> to view chart)
            </Typography>
          }
        </div>
        <div className="relative w-1/3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 z-10" size={18} />
          <Input
            className="pl-10"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search charts..."
            type="text"
            value={searchQuery}
          />
        </div>
      </div>

      {hasNoData ? (
        <div className="text-center py-12">
          <Typography variant="caption">
            CPU and memory usage data charts will appear here
          </Typography>
        </div>
      ) : filteredCharts.length === 0 ? (
        <div className="text-center py-12">
          <Typography variant="caption">
            No charts found matching "{searchQuery}"
          </Typography>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredCharts.map((chart) => (
            <ChartTile
              chartColor={
                chart.chartType === "cpu"
                  ? "var(--chart-1)"
                  : colors[
                    memoryMetrics.findIndex(([key]) => key === chart.id) %
                  colors.length
                  ]
              }
              chartData={
                chart.chartType === "cpu"
                  ? cpuUsageData || []
                  : memoryMetrics.find(([key]) => key === chart.id)?.[1]?.series || []
              }
              key={chart.id}
              onClick={() => setOpenChart(chart.chartType)}
              subtitle={chart.subtitle}
              title={chart.title}
            />
          ))}
        </div>
      )}

      {/* cpu chart in the modal */}
      {openChart === "cpu" && (
        <ChartModal
          action={
            <ButtonGroup
              onChange={setCpuTimeRange}
              options={[
                { value: "1h", label: "1H" },
                { value: "6h", label: "6H" },
                { value: "12h", label: "12H" },
              ]}
              value={cpuTimeRange}
            />
          }
          onClose={() => setOpenChart(null)}
          open={true}
          subtitle="Real-time CPU utilization monitoring"
          title="CPU Usage Over Time"
        >
          <AreaChartComponent
            color="var(--chart-1)"
            data={cpuUsageData}
            label="CPU Usage"
            unit=" (%)"
          />
        </ChartModal>
      )}

      {/* memory charts in the modal */}
      {openChart && typeof openChart === "object" && openChart.type === "memory" && (
        <ChartModal
          action={
            <ButtonGroup
              onChange={setMemoryTimeRange}
              options={[
                { value: "1h", label: "1H" },
                { value: "6h", label: "6H" },
                { value: "12h", label: "12H" },
              ]}
              value={memoryTimeRange}
            />
          }
          onClose={() => setOpenChart(null)}
          open={true}
          subtitle={
            memoryMetrics.find(([key]) => key === openChart.key)?.[1]?.description ||
            "Memory usage monitoring"
          }
          title={formatMetricName(openChart.key)}
        >
          <AreaChartComponent
            color={
              colors[
                memoryMetrics.findIndex(([key]) => key === openChart.key) %
              colors.length
              ]
            }
            data={
              memoryMetrics.find(([key]) => key === openChart.key)?.[1]?.series || []
            }
            label={formatMetricName(openChart.key)}
            unit={formatMetricUnit(openChart.key)}
            valueFormatter={getValueFormatter(openChart.key)}
          />
        </ChartModal>
      )}
    </div>
  )
}
