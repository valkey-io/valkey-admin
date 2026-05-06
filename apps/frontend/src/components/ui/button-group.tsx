import { Button } from "./button"
import type { ReactNode } from "react"

interface ButtonGroupOption {
  value: string
  label: ReactNode
}

interface ButtonGroupProps {
  options: ButtonGroupOption[]
  value: string
  onChange: (value: string) => void
}

export function ButtonGroup({
  options,
  value,
  onChange,
}: ButtonGroupProps) {

  return (
    <div className={"flex gap-2"}>
      {options.map((option) => (
        <Button
          key={String(option.value)}
          onClick={() => onChange(option.value)}
          size={"sm"}
          type="button"
          variant={`${value === option.value ? "default" : "outline"}`}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}
