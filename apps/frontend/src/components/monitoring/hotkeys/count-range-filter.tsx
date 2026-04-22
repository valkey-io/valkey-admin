import { useEffect, useRef, useState } from "react"
import { ChevronDown, Hash } from "lucide-react"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Typography } from "../../ui/typography"

interface CountRangeFilterProps {
  countMin: string
  countMax: string
  onCountMinChange: (v: string) => void
  onCountMaxChange: (v: string) => void
  dataMin: number
  dataMax: number
}

export function CountRangeFilter({
  countMin, countMax, onCountMinChange, onCountMaxChange, dataMin, dataMax,
}: CountRangeFilterProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const parsedMin = countMin !== "" ? Number(countMin) : null
  const parsedMax = countMax !== "" ? Number(countMax) : null
  const isFiltered = parsedMin !== null || parsedMax !== null

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
            ? `${parsedMin ?? dataMin} – ${parsedMax ?? dataMax}`
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
                onClick={() => { onCountMinChange(""); onCountMaxChange("") }}
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
              <Input
                className="h-7 text-xs"
                max={parsedMax ?? dataMax}
                min={0}
                onChange={(e) => onCountMinChange(e.target.value)}
                placeholder={dataMin.toLocaleString()}
                type="number"
                value={countMin}
              />
            </div>
            <div className="space-y-1">
              <Typography variant={"bodyXs"}>Max</Typography>
              <Input
                className="h-7 text-xs"
                min={parsedMin ?? dataMin}
                onChange={(e) => onCountMaxChange(e.target.value)}
                placeholder={dataMax.toLocaleString()}
                type="number"
                value={countMax}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
