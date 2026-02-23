import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { Typography } from "./typography"

interface LineChartComponentProps {
  data: Array<{ timestamp: number; value: number }>;
  label?: string;
  color?: string;
  title?: string;
  subtitle?: string;
  unit?: string;
  valueFormatter?: (value: number) => string;
}

// could be resued for memory usage or cpu usage
export default function LineChartComponent({
  data,
  label = "Usage",
  color = "var(--chart-1)",
  title,
  subtitle,
  unit,
  valueFormatter,
}: LineChartComponentProps) {
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
      <ResponsiveContainer height={300} width="100%">
        <LineChart
          data={data}
          margin={{
            top: 5,
            right: 30,
            left: 0,
            bottom: 5,
          }}
        >
          <CartesianGrid className="stroke-gray-300 dark:stroke-gray-600" strokeDasharray="3 3" />
          <XAxis
            angle={-45}
            className="text-xs"
            dataKey="timestamp"
            fontSize={12}
            height={80}
            textAnchor="end"
            tick={{ fill: "currentColor" }}
            tickFormatter={(ts) => ts ? new Date(ts).toLocaleTimeString() : ""}
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
            labelFormatter={(ts) => ts ? new Date(ts).toLocaleTimeString() : ""}
            labelStyle={{ color: "#666" }}
          />
          <Line
            activeDot={{ r: 6 }}
            dataKey="value"
            dot={{ r: 3 }}
            name={label}
            stroke={color}
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
