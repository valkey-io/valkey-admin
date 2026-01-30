import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { useParams } from "react-router"
import { formatBytes } from "@common/src/bytes-conversion"
import LineChartComponent from "../ui/line-chart"
import { ButtonGroup } from "../ui/button-group"
import { ChartSection } from "../ui/chart-section"
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

export default function CpuMemoryUsage() {
  const { id } = useParams()
  const dispatch = useAppDispatch()
  const cpuUsageData = useSelector(selectCpuUsage(id ?? ""))
  const memoryUsageData = useSelector(selectMemoryUsage(id ?? ""))
  const [cpuTimeRange, setCpuTimeRange] = useState("1h")
  const [memoryTimeRange, setMemoryTimeRange] = useState("1h")

  // for cpu
  useEffect(() => {
    if (id) {
      dispatch(cpuUsageRequested({ connectionId: id, timeRange: cpuTimeRange }))
    }
  }, [id, dispatch, cpuTimeRange])

  // for memory
  useEffect(() => {
    if (id) {
      dispatch(memoryUsageRequested({ connectionId: id, timeRange: memoryTimeRange }))
    }
  }, [id, dispatch, memoryTimeRange])

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

  return (
    <>
      {/* CPU Usage Section */}
      <ChartSection
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
        className="mt-4"
        emptyMessage="CPU usage data will appear here"
        isEmpty={!cpuUsageData || cpuUsageData.length === 0}
        subtitle="Real-time CPU utilization monitoring"
        title="CPU Usage Over Time"
      >
        <LineChartComponent
          color="var(--tw-chart1)"
          data={cpuUsageData}
          label="CPU Usage"
          unit=" (%)"
        />
      </ChartSection>

      {/* Memory Usage Section */}
      <ChartSection
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
        className="mt-4"
        emptyMessage="Memory usage data will appear here"
        isEmpty={memoryMetrics.length === 0}
        subtitle="Real-time Memory utilization monitoring"
        title="Memory Usage Over Time"
      >
        <div className="grid grid-cols-2 gap-4">
          {memoryMetrics?.map(([key, metric], index) => (
            <ChartSection
              key={key}
              subtitle={metric?.description}
              title={formatMetricName(key)}
            >
              <LineChartComponent
                color={colors[index % colors.length]}
                data={metric?.series || []}
                label={formatMetricName(key)}
                unit={formatMetricUnit(key)}
                valueFormatter={getValueFormatter(key)}
              />
            </ChartSection>
          ))}
        </div>
      </ChartSection>
    </>
  )
}
