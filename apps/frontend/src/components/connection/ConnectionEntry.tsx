import { CONNECTED, ERROR } from "@common/src/constants.ts"
import {
  AlertCircleIcon,
  CircleChevronRight,
  CircleDotIcon,
  CircleSmallIcon,
  PencilIcon,
  PowerIcon, PowerOffIcon,
  Trash2Icon
} from "lucide-react"
import { Link } from "react-router"
import type { ReactNode } from "react"
import {
  type ConnectionState,
  connectPending,
  closeConnection,
  deleteConnection
} from "@/state/valkey-features/connection/connectionSlice"
import { Button } from "@/components/ui/button.tsx"
import { cn } from "@/lib/utils.ts"
import history from "@/history.ts"
import { useAppDispatch } from "@/hooks/hooks.ts"

type ConnectionEntryProps = {
  connectionId: string,
  connection: ConnectionState,
  clusterId?: string,
}

const ConnectionEntryGrid = ({ children, className } : { children: ReactNode, className?: string}) =>
  <div className={cn("grid grid-cols-[10rem_1fr_23rem] items-center py-1", className)}>
    {children}
  </div>

export const ConnectionEntryHeader = () =>
  <ConnectionEntryGrid className="font-bold bg-gray-100 dark:bg-tw-dark-primary">
    <div className="pl-4">Status</div>
    <div className="pl-4">Instance</div>
    <div className="text-right pr-4">Actions</div>
  </ConnectionEntryGrid>

export const ConnectionEntry = ({ connectionId, connection, clusterId }: ConnectionEntryProps) => {
  const dispatch = useAppDispatch()
  const handleDisconnect = () => dispatch(closeConnection({ connectionId }))

  const handleConnect = () => dispatch(connectPending({ ...connection.connectionDetails, connectionId }))
  const handleDelete = () => dispatch(deleteConnection({ connectionId }))

  const isConnected = connection.status === CONNECTED
  const isError = connection.status === ERROR
  const label = `${connection.connectionDetails.username}@${connection.connectionDetails.host}:${connection.connectionDetails.port}`

  return (
    <ConnectionEntryGrid>
      <div className={cn(isConnected ? "text-teal-500" : "text-gray-500", "flex flex-row pl-2 text-sm font-semibold items-center")}>
        {
          isConnected ? <CircleDotIcon className="mr-2"/> :
            isError ? <AlertCircleIcon className="mr-2"/> : <CircleSmallIcon className="mr-2"/>
        }
        {connection.status}
      </div>
      {
        <Button asChild className={cn(!isConnected && "pointer-events-none", "justify-self-start")} variant="link">
          <Link title={label} to={(clusterId ? `/${clusterId}/${connectionId}/dashboard` : `/${connectionId}/dashboard`)}>{label}</Link>
        </Button>
      }
      <div className="flex flex-row justify-end">
        {
          isConnected &&
          <>
            <Button onClick={() => history.navigate(clusterId ? `/${clusterId}/${connectionId}/cluster-topology` : `/${connectionId}/dashboard`)} variant="ghost">
              <CircleChevronRight />
              Open
            </Button>
            <Button onClick={() => alert("todo")} variant="ghost">
              <PencilIcon />
              Edit
            </Button>
            <Button onClick={handleDisconnect} variant="ghost">
              <PowerOffIcon />
              Disconnect
            </Button>
          </>
        }
        {
          !isConnected &&
          <Button onClick={handleConnect} variant="ghost">
            <PowerIcon />
            Connect
          </Button>
        }
        <Button onClick={handleDelete} variant="destructiveGhost">
          <Trash2Icon />
          Delete
        </Button>
      </div>
    </ConnectionEntryGrid>
  )
}
