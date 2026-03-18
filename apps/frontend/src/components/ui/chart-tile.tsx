import { ChartNoAxesCombined, Maximize2 } from "lucide-react"
import { AreaChart, Area, ResponsiveContainer } from "recharts"
import { Card } from "./card"
import { Button } from "./button"
import { Typography } from "./typography"
import { cn } from "@/lib/utils"

interface ChartTileProps {
  title: string
  subtitle?: string
  onClick: () => void
  className?: string
  chartData?: Array<{ timestamp: number; value: number }>
  chartColor?: string
}

export function ChartTile({
  title,
  subtitle,
  onClick,
  className,
  chartData,
  chartColor = "var(--chart-1)",
}: ChartTileProps) {
  return (
    <Card
      className={cn(
        "transition-all hover:shadow-md hover:border-primary/50 group h-full relative",
        className,
      )}
    >
      <Button
        className="absolute top-3 right-3 z-10"
        onClick={onClick}
        size="sm"
        variant="ghost"
      >
        <Maximize2 size={16} />
      </Button>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <ChartNoAxesCombined className="text-primary mt-1" size={20} />
          <div className="flex-1 min-w-0 pr-8">
            <Typography variant={"label"}>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant={"bodyXs"}>
                {subtitle}
              </Typography>
            )}
          </div>
        </div>
      </div>
      {chartData && chartData.length > 0 && (
        <div className="h-16 w-full opacity-70 group-hover:opacity-100 transition-opacity px-4 pb-4">
          <ResponsiveContainer height={50} width="100%">
            <AreaChart data={chartData}>
              <Area
                dataKey="value"
                dot={false}
                fill={chartColor}
                fillOpacity={0.15}
                stroke={chartColor}
                strokeWidth={2}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
