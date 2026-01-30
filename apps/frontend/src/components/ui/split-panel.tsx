import type { ReactNode } from "react"

interface SplitPanelProps {
  left: ReactNode
  right: ReactNode
  className?: string
  leftClassName?: string
  rightClassName?: string
}

export function SplitPanel({
  left,
  right,
  className = "",
  leftClassName = "",
  rightClassName = "",
}: SplitPanelProps) {
  return (
    <div className={`flex flex-1 min-h-0 ${className}`}>
      <div className={`w-1/2 pr-2 ${leftClassName}`}>
        {left}
      </div>
      <div className={`w-1/2 ${rightClassName}`}>
        {right}
      </div>
    </div>
  )
}
