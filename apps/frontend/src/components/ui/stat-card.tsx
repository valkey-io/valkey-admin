import * as React from "react"
import { Typography } from "./typography"
import { cn } from "@/lib/utils"

interface StatCardProps extends React.ComponentProps<"div"> {
  value: string | number
  label: string
  icon?: React.ReactNode
  tooltip?: React.ReactNode
}

function StatCard({
  value,
  label,
  icon,
  tooltip,
  className,
  ...props
}: StatCardProps) {
  return (
    <div
      className={cn(
        "h-20 p-4 rounded-md border border-input bg-white dark:bg-input/30",
        "flex flex-col justify-center items-center",
        className,
      )}
      data-slot="stat-card"
      {...props}
    >
      <div className="flex items-center gap-1">
        {icon}
        <Typography variant="heading">{value}</Typography>
      </div>
      <Typography className="flex items-center gap-1" variant={"bodySm"}>
        {label}
        {tooltip}
      </Typography>
    </div>
  )
}

export { StatCard }
