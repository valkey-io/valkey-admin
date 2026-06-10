import { Skeleton } from "../ui/skeleton"

export function DashboardSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto" data-slot="dashboard-skeleton">
      {/* Stat cards row */}
      <div className="flex mb-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton className="h-20 flex-1" key={i} />
        ))}
      </div>
      {/* Metrics panel */}
      <div className="p-4 border border-input rounded-md shadow-xs">
        <Skeleton className="h-9 w-full mb-4" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton className="h-12 w-full" key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
