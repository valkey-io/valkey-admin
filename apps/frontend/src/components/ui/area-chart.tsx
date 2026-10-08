import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { MILLISECONDS_IN_A_DAY } from "@common/src/constants"
import { chartTimestampFormatter } from "@common/src/time-utils"
import { LoadingState } from "./loading-state"
import { Typography } from "./typography"
import { cn } from "@/lib/utils"

interface AreaChartComponentProps {
  data: Array<{ timestamp: number; value: number }>;
  label?: string;
  color?: string;
  title?: string;
  subtitle?: string;
  unit?: string;
  valueFormatter?: (value: number) => string;
  loading?: boolean;
}

// could be resued for memory usage or cpu usage
export default function AreaChartComponent({
  data,
  label = "Usage",
  color = "var(--chart-1)",
  title,
  subtitle,
  unit,
  valueFormatter,
  loading = false,
}: AreaChartComponentProps) {
  const gradientId = `areaGradient-${label.replace(/\s+/g, "-")}`
  const spansMultipleDays = data.length > 1 && data[data.length - 1].timestamp - data[0].timestamp > MILLISECONDS_IN_A_DAY
  const formatChartTime = chartTimestampFormatter(spansMultipleDays)

  return (
    <div className="w-full">
      {title && (
        <Typography className="text-center mb-2" variant="subheading">
          {title}
        </Typography>
      )}
      {subtitle && (
        <Typography className="text-center mb-4" variant="bodySm">
          {subtitle}
        </Typography>
      )}
      <div className="relative">
        <ResponsiveContainer className={cn(loading && "opacity-40")} height={300} width="100%">
          <AreaChart
            data={data}
            margin={{
              top: 5,
              right: 30,
              left: 0,
              bottom: 5,
            }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid className="stroke-gray-300 dark:stroke-gray-600" strokeDasharray="3 3" />
            <XAxis
              angle={-45}
              className="text-xs"
              dataKey="timestamp"
              fontSize={12}
              height={80}
              textAnchor="end"
              tick={{ fill: "currentColor" }}
              tickFormatter={formatChartTime}
              tickSize={5}
            />
            <YAxis
              className="text-xs"
              fontSize={12}
              label={{ value: `${unit}`, angle: -90, position: "insideLeft", fontSize: 12, offset: 5 }}
              tick={{ fill: "currentColor" }}
              tickFormatter={valueFormatter}
              width={80}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "0.375rem",
              }}
              formatter={(value) => valueFormatter ? valueFormatter(Number(value)) : `${value}%`}
              labelFormatter={formatChartTime}
              labelStyle={{ color: "#666" }}
            />
            <Area
              activeDot={{ r: 6 }}
              dataKey="value"
              dot={{ r: 3 }}
              fill={`url(#${gradientId})`}
              fillOpacity={1}
              name={label}
              stroke={color}
              strokeWidth={2}
              type="monotone"
            />
          </AreaChart>
        </ResponsiveContainer>
        {loading && <LoadingState className="absolute inset-0" message="Loading chart data..." />}
      </div>
    </div>
  )
}
