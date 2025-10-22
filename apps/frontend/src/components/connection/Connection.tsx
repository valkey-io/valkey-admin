import { useState } from "react"
import { useSelector } from "react-redux"
import { HousePlug } from "lucide-react"
import * as R from "ramda"
import ConnectionForm from "../ui/connection-form.tsx"
import EditForm from "../ui/edit-form.tsx"
import { selectConnections } from "@/state/valkey-features/connection/connectionSelectors.ts"
import { ConnectionEntry, ConnectionEntryHeader } from "@/components/connection/ConnectionEntry.tsx"

export function Connection() {
  const [showConnectionForm, setShowConnectionForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const connections = useSelector(selectConnections)

  const connectButton = () =>
    <button
      className="bg-tw-primary text-white px-2 rounded text-sm font-light py-1 cursor-pointer"
      onClick={() => setShowConnectionForm(!showConnectionForm)}
    >
      + Add Connection
    </button>

  return (
    <div className="p-4 relative min-h-screen flex flex-col">
      {/* top header */}
      <div className="flex items-center justify-between h-10">
        <h1 className="text-xl font-bold flex items-center gap-2 text-gray-700 dark:text-white">
          <HousePlug /> Connections
        </h1>
        { R.isNotEmpty(connections) && connectButton() }
      </div>
      {
        showConnectionForm &&
        <ConnectionForm onClose={() => setShowConnectionForm(false)} />
      }
      {
        showEditForm && // todo make this a separate URL /:id/edit; it's also unclear what edit means beside saving it in localStorage
        <EditForm onClose={() => setShowEditForm(false)} />
      }
      {
        R.isEmpty(connections) ?
          <div className=" bg-white flex-1 flex items-center justify-center flex-col gap-2">
            <span className="text-sm font-light text-gray-500">
              You Have No Connections!
            </span>
            <p className="text-sm font-light text-gray-500">
              Click "+ Add Connection" button to connect to a Valkey instance.
            </p>
            { connectButton() }
          </div> :
          <div className="border-t-1 mt-8 flex flex-col flex-1">
            <ConnectionEntryHeader />
            {
              Object.entries(connections).map(([connectionId, connection]) =>
                <ConnectionEntry
                  clusterId={connection.connectionDetails.clusterId}
                  connection={connection}
                  connectionId={connectionId}
                  key={connectionId}
                />)
            }
          </div>
      }
    </div>
  )
}
