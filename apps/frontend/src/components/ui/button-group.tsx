import type { ReactNode } from "react"

interface ButtonGroupOption {
  value: string
  label: ReactNode
}

interface ButtonGroupProps {
  options: ButtonGroupOption[]
  value: string
  onChange: (value: string) => void
  className?: string
  size?: "sm" | "md" | "lg"
}

export function ButtonGroup({
  options,
  value,
  onChange,
  className = "",
  size = "sm",
}: ButtonGroupProps) {
  const sizeClasses = {
    sm: "px-2 py-1 text-sm",
    md: "px-3 py-2 text-base",
    lg: "px-4 py-3 text-lg",
  }

  return (
    <div className={`flex gap-2 ${className}`}>
      {options.map((option) => (
        <button
          className={`rounded transition-colors ${sizeClasses[size]} ${value === option.value
            ? "bg-tw-primary text-white"
            : "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
          }`}
          key={String(option.value)}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
