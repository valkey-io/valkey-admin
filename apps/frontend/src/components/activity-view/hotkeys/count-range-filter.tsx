import { useEffect, useRef, useState } from "react"
import { ChevronDown, Hash } from "lucide-react"
import { Button } from "../../ui/button"
import { NumberInput } from "../../ui/number-input"
import { Typography } from "../../ui/typography"

interface CountRangeFilterProps {
  countMin: number | null
  countMax: number | null
  onCountMinChange: (v: number | null) => void
  onCountMaxChange: (v: number | null) => void
  dataMin: number
  dataMax: number
}

export function CountRangeFilter({
  countMin, countMax, onCountMinChange, onCountMaxChange, dataMin, dataMax,
}: CountRangeFilterProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const isFiltered = countMin !== null || countMax !== null

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <Button
        className={isFiltered ? "border-primary text-primary" : ""}
        onClick={() => setOpen((prev) => !prev)}
        type="button"
        variant="outline"
      >
        <Hash className="text-primary" size={14} />
        <span className="text-xs w-24">
          {isFiltered
            ? `${countMin ?? dataMin} – ${countMax ?? dataMax}`
            : "Access Count"
          }
        </span>
        <ChevronDown className="text-muted-foreground" size={14} />
      </Button>

      {open && (
        <div className="absolute z-50 right-0 top-11 w-68 rounded-md border bg-popover shadow-md p-3 space-y-3">
          <div className="flex items-center justify-between">
            <Typography variant={"bodyXs"}>
              Adjust the Min and Max access count to filter results:
            </Typography>
            {isFiltered && (
              <Button
                onClick={() => { onCountMinChange(null); onCountMaxChange(null) }}
                size={"sm"}
                variant={"link"}
              >
                Reset
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-primary/20">
            <Typography variant={"bodyXs"}>Access Count range:</Typography>
            <Typography className="font-mono font-medium" variant="caption">
              {dataMin.toLocaleString()} – {dataMax.toLocaleString()}
            </Typography>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Typography variant={"bodyXs"}>Min</Typography>
              <NumberInput
                allowEmpty
                className="h-7 text-xs"
                max={countMax ?? dataMax}
                min={0}
                onChange={onCountMinChange}
                placeholder={dataMin.toLocaleString()}
                value={countMin}
              />
            </div>
            <div className="space-y-1">
              <Typography variant={"bodyXs"}>Max</Typography>
              <NumberInput
                allowEmpty
                className="h-7 text-xs"
                max={dataMax}
                min={countMin ?? dataMin}
                onChange={onCountMaxChange}
                placeholder={dataMax.toLocaleString()}
                value={countMax}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
