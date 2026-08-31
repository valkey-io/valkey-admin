import { Typography } from "../../ui/typography"
import { getColor, LEGEND_STEPS } from "./heatmap-scale"

interface HeatmapLegendProps {
  label: string
  selectedBuckets: Set<number>
  onToggle: (step: number) => void
}

export function HeatmapLegend({ label, selectedBuckets, onToggle }: HeatmapLegendProps) {
  const hasBucketFilter = selectedBuckets.size > 0

  return (
    <div className="flex items-center justify-between gap-4">
      <Typography variant="bodyXs">{label}</Typography>
      <div className="flex gap-1 shrink-0">
        {LEGEND_STEPS.map((step) => {
          const isSelected = selectedBuckets.has(step)
          return (
            <button
              aria-label={`Filter band ${LEGEND_STEPS.indexOf(step) + 1}`}
              aria-pressed={isSelected}
              className={`w-5 h-5 rounded-full transition-all focus:outline-none
                ${isSelected
              ? "ring-2 ring-offset-1 ring-foreground scale-110"
              : hasBucketFilter
                ? "opacity-30 hover:opacity-70"
                : "hover:scale-110 hover:ring-1 hover:ring-border"
            }`}
              key={step}
              onClick={() => onToggle(step)}
              style={{ backgroundColor: getColor(step) }}
              type="button"
            />
          )
        })}
      </div>
    </div>
  )
}
