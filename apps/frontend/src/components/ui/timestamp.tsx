import { useEffect, useState } from "react"
import { interval, Subject } from "rxjs"
import { share } from "rxjs/operators"
import { formatTimestamp, timeAgo } from "@common/src/time-utils.ts"
import { cn } from "@/lib/utils.ts"

// shared 1s ticker (starts/stops automatically) with all Timestamp components, not just one
const second$ = interval(1000).pipe(
  share({ connector: () => new Subject<number>(), resetOnRefCountZero: true })
)

export function Timestamp({ className, timestamp }: { className?: string, timestamp: number }) {
  const [hovered, setHovered] = useState(false)
  const [, force] = useState(0)

  useEffect(() => {
    if (!hovered) return
    const sub = second$.subscribe(() => force(x => x + 1))
    return () => sub.unsubscribe()
  }, [hovered])

  const onEnter = () => setHovered(true)
  const onLeave = () => setHovered(false)

  return (
    <div
      className={cn("relative shrink-0 mr-2 group cursor-default", className)}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <span className="transition-opacity duration-200 group-hover:opacity-0">
        {formatTimestamp(timestamp)}
      </span>

      <span className="absolute left-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        {timeAgo(timestamp)}
      </span>
    </div>
  )
}
