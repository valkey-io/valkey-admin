import { useParams } from "react-router"
import { useSelector } from "react-redux"
import type { ReactNode } from "react"
import { selectConnectionDetails } from "@/state/valkey-features/connection/connectionSelectors.ts"
import { cn } from "@/lib/utils.ts"

type AppHeaderProps = {
  className?: string;
  title: string;
  icon: ReactNode;
};

function AppHeader({ title, icon, className }: AppHeaderProps) {
  const { id } = useParams<{ id: string }>()
  const { host, port, username } = useSelector(selectConnectionDetails(id!))

  return (
    <div className={cn("flex h-10 mb-4 gap-2 items-center justify-between", className)}>
      <h1 className="font-bold text-xl flex items-center gap-2">
        {icon}
        {title}
      </h1>
      <div className="">
        <span className="text-sm font-light border-2 border-tw-primary text-tw-primary px-3 py-1 rounded">
          {username}@{host}:{port}
        </span>
      </div>
    </div>
  )
}

export { AppHeader }
