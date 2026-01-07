import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, Label } from "recharts"
import { useEffect } from "react"
import { useParams } from "react-router"
import { useSelector } from "react-redux"
import { formatBytes } from "@common/src/bytes-conversion"
import { calculateTotalMemoryUsage } from "@common/src/memory-usage-calculation"
import { selectKeys } from "@/state/valkey-features/keys/keyBrowserSelectors"
import { useAppDispatch } from "@/hooks/hooks"
import { getKeysRequested } from "@/state/valkey-features/keys/keyBrowserSlice"

interface KeyInfo {
  name: string;
  type: string;
  ttl: number;
  size: number;
  collectionSize?: number;
  elements?: string | string[] | { [key: string]: string };
}

interface ChartDataItem {
  name: string;
  count: number;
  totalSize: number;
  percentage: string;
  [key: string]: string | number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: ChartDataItem;
  }>;
}

export default function DonutChart() {
  const { id } = useParams()
  const dispatch = useAppDispatch()

  useEffect(() => {
    if (id) {
      dispatch(getKeysRequested({ connectionId: id }))
    }
  }, [id, dispatch])

  const keys: KeyInfo[] = useSelector(selectKeys(id!))

  // count and memory usage per each key type
  const keyTypeInfo = keys.reduce((stats, key) => {
    (stats[key.type] ??= { count: 0, totalSize: 0 }).count += 1
    stats[key.type].totalSize += key.size
    return stats
  }, {} as Record<string, { count: number; totalSize: number }>)

  // chart data
  const chartData: ChartDataItem[] = Object.entries(keyTypeInfo).map(([type, stats]) => ({
    name: type.charAt(0).toUpperCase() + type.slice(1),
    count: stats.count,
    totalSize: stats.totalSize,
    percentage: ((stats.count / keys.length) * 100).toFixed(1),
  }))

  const totalKeys = keys.length
  const totalMemory = calculateTotalMemoryUsage(keys)

  const chartColors: Record<string, string> = {
    "Set": "var(--tw-chart3)",
    "Hash": "var(--tw-chart1)",
    "List": "var(--tw-chart4)",
    "String": "var(--tw-chart2)",
    "Zset": "var(--tw-chart5)",
    "Stream": "var(--tw-chart6)",
    "ReJSON-RL": "var(--tw-chart7)",
  }

  const CustomTooltip = ({ active, payload }: TooltipProps) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-3 border border-tw-dark-border rounded shadow-lg">
          <p className="font-semibold text-gray-800">{data.name}</p>
          <p className="text-sm text-gray-600">Count: {data.count}</p>
          <p className="text-sm text-gray-600">Percentage: {data.percentage}%</p>
          <p className="text-sm text-gray-600">Total Memory: {formatBytes(data.totalSize)}</p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="w-full">
      <h1 className="text-xl font-bold text-center mb-2 text-black dark:text-white">
        Key Type Distribution
      </h1>
      <div className="text-center text-sm text-gray-600 dark:text-gray-400 mb-4">
        Total Memory: {formatBytes(totalMemory)}
      </div>
      <ResponsiveContainer className="text-sm" height={500} width="100%">
        <PieChart>
          <Pie
            cx="50%"
            cy="50%"
            data={chartData}
            dataKey="count"
            innerRadius={140}
            label={({ name, percentage }) => `${name}: ${percentage}%`}
            outerRadius={170}
            paddingAngle={5}
          >
            {chartData.map((entry, index) => (
              <Cell fill={chartColors[entry.name]} key={index} />
            ))}
          </Pie>
          <Label fill="#666" position="center"
            value={`Sampled Keys : ${totalKeys}`}>
          </Label>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value: string) => value
            }
            height={36}
            verticalAlign="bottom"
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

