import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { useParams } from "react-router"
import { formatBytes } from "@common/src/bytes-conversion"
import LineChartComponent from "./line-chart"
import { cpuUsageRequested, selectCpuUsage } from "@/state/valkey-features/cpu/cpuSlice.ts"
import { useAppDispatch } from "@/hooks/hooks"
import { memoryUsageRequested, selectMemoryUsage } from "@/state/valkey-features/memory/memorySlice"

const colors = [
  "var(--tw-chart1)",
  "var(--tw-chart2)",
  "var(--tw-chart3)",
  "var(--tw-chart4)",
  "var(--tw-chart5)",
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
    return key
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
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
      <div className="mt-4 border dark:border-tw-dark-border rounded p-4 bg-white dark:bg-gray-800">
        <div className="flex gap-2 justify-end">
          {(["1h", "6h", "12h"] as const).map((range) => (
            <button
              className={`px-2 py-1 rounded text-sm ${cpuTimeRange === range
                ? "bg-tw-primary text-white"
                : "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
              }`}
              key={range}
              onClick={() => setCpuTimeRange(range)}
            >
              {range.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex flex-col items-center">
          <h3 className="text-lg font-bold mb-2 text-center">CPU Usage Over Time</h3>
          <span className="text-center text-sm text-gray-600 dark:text-gray-400 mb-6">Real-time CPU utilization monitoring</span>
        </div>
        {!cpuUsageData || cpuUsageData.length === 0 ? (
          <div className="flex items-center justify-center h-[300px] border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            <div className="text-center">
              <p className="text-gray-500 dark:text-gray-400">
                CPU usage data will appear here
              </p>
            </div>
          </div>
        ) : (
          <LineChartComponent
            color="var(--tw-chart1)"
            data={cpuUsageData}
            label="CPU Usage"
            unit=" (%)"
          />
        )}
      </div>

      {/* Memory Usage Section */}
      <div className="mt-4 border dark:border-tw-dark-border rounded p-4 bg-white dark:bg-gray-800">
        <div className="">
          
          <div className="flex gap-2 justify-end">
            {(["1h", "6h", "12h"] as const).map((range) => (
              <button
                className={`px-2 py-1 rounded text-sm ${memoryTimeRange === range
                  ? "bg-tw-primary text-white"
                  : "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                }`}
                key={range}
                onClick={() => setMemoryTimeRange(range)}
              >
                {range.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex flex-col items-center">

            <h3 className="text-lg font-bold mb-2">Memory Usage Over Time</h3>
            <span className="text-center text-sm text-gray-600 dark:text-gray-400 mb-6">Real-time Memory utilization monitoring</span>
          </div>
        </div>
        {memoryMetrics.length === 0 ? (
          <div className="flex items-center justify-center h-[300px] border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            <div className="text-center">
              <p className="text-gray-500 dark:text-gray-400">
                Memory usage data will appear here
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {memoryMetrics?.map(([key, metric], index) => (
              <div className="border dark:border-tw-dark-border rounded p-4 bg-white dark:bg-gray-800" key={key}>
                <LineChartComponent
                  color={colors[index % colors.length]}
                  data={metric?.series || []}
                  label={formatMetricName(key)}
                  subtitle={metric?.description}
                  title={formatMetricName(key)}
                  unit={formatMetricUnit(key)}
                  valueFormatter={getValueFormatter(key)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
