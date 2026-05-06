import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface LoadingStateProps {
  message?: string
  className?: string
  size?: number
}

export function LoadingState({
  message = "Loading...",
  className,
  size = 32,
}: LoadingStateProps) {
  return (
    <div className={cn("h-full flex items-center justify-center", className)}>
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="animate-spin text-primary" size={size} />
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {message}
        </span>
      </div>
    </div>
  )
}
