import * as React from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

interface BaseNumberInputProps extends Omit<React.ComponentProps<"input">, "type" | "value" | "onChange" | "step" | "min" | "max"> {
  min?: number
  max?: number
  // Custom increment applied from the current value, unlike the native step
  // attribute which snaps to a min-anchored grid of legal values.
  step?: number
}

interface NonNullableNumberInputProps extends BaseNumberInputProps {
  allowEmpty?: false
  value: number
  onChange: (value: number) => void
}

// With allowEmpty, a cleared input reports null (e.g. "no filter set") and
// blur preserves the empty state instead of clamping it to a number.
interface NullableNumberInputProps extends BaseNumberInputProps {
  allowEmpty: true
  value: number | null
  onChange: (value: number | null) => void
}

type NumberInputProps = NonNullableNumberInputProps | NullableNumberInputProps

function clamp(value: number, min?: number, max?: number) {
  if (min !== undefined && value < min) return min
  if (max !== undefined && value > max) return max
  return value
}

function NumberInput({ value, onChange, min, max, step = 1, allowEmpty, className, style, disabled, ...props }: NumberInputProps) {
  const emit = onChange as (value: number | null) => void

  const stepBy = (direction: 1 | -1) => {
    if (disabled) return
    if (value === null) {
      emit(clamp(min ?? 0, min, max))
      return
    }
    emit(clamp(value + direction * step, min, max))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault()
      stepBy(e.key === "ArrowUp" ? 1 : -1)
    }
  }

  return (
    <div className="relative" style={style}>
      <Input
        className={cn(
          "pr-6 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          className,
        )}
        disabled={disabled}
        onBlur={() => { if (value !== null) emit(clamp(value, min, max)) }}
        onChange={(e) => emit(allowEmpty && e.target.value === "" ? null : Number(e.target.value))}
        onKeyDown={handleKeyDown}
        type="number"
        value={value ?? ""}
        {...props}
      />
      <div aria-hidden className="absolute inset-y-0 right-0 flex flex-col justify-center pr-1">
        <button
          className={cn(
            "flex h-3.5 items-center justify-center rounded-sm text-muted-foreground",
            "hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
          )}
          disabled={disabled}
          onClick={() => stepBy(1)}
          tabIndex={-1}
          type="button"
        >
          <ChevronUp size={14} />
        </button>
        <button
          className={cn(
            "flex h-3.5 items-center justify-center rounded-sm text-muted-foreground",
            "hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
          )}
          disabled={disabled}
          onClick={() => stepBy(-1)}
          tabIndex={-1}
          type="button"
        >
          <ChevronDown size={14} />
        </button>
      </div>
    </div>
  )
}

export { NumberInput }
