import { useState } from "react"
import { EditActionButtons } from "../../ui/edit-action-buttons"
import { Textarea } from "../../ui/textarea"
import { useAppDispatch } from "@/hooks/hooks"
import { updateKeyRequested } from "@/state/valkey-features/keys/keyBrowserSlice"
import { cn } from "@/lib/utils"

interface KeyDetailsStringProps {
  selectedKey: string;
  selectedKeyInfo: {
    name: string;
    type: "string";
    ttl: number;
    size: number;
    elements: string;
  };
  connectionId: string;
  readOnly: boolean;
}

export default function KeyDetailsString(
  { selectedKey, selectedKeyInfo, connectionId, readOnly = false }: KeyDetailsStringProps,
) {
  const dispatch = useAppDispatch()
  const [isEditable, setIsEditable] = useState(false)
  const [editedValue, setEditedValue] = useState("")

  const handleEdit = () => {
    if (isEditable) {
      // Cancel edit
      setIsEditable(false)
      setEditedValue("")
    } else {
      // Start editing
      setEditedValue(selectedKeyInfo.elements)
      setIsEditable(true)
    }
  }

  const handleSave = () => {
    dispatch(updateKeyRequested({
      connectionId: connectionId,
      key: selectedKey,
      keyType: "string",
      value: editedValue,
    }))
    setIsEditable(false)
    setEditedValue("")
  }
  return (
    <div className="flex items-center justify-center w-full p-4">
      <table className="table-auto w-full overflow-hidden">
        <thead className={cn("bg-muted/60 text-foreground")}>
          <tr>
            <th className="w-full py-3 px-4 text-left font-semibold">
              Value
            </th>
            <th className="">
              <EditActionButtons
                isEditable={isEditable}
                onEdit={handleEdit}
                onSave={handleSave}
                readOnly={readOnly}
              />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={cn("py-3 px-4 font-light text-foreground")} colSpan={2}>
              {isEditable ? (
                <Textarea
                  autoFocus
                  className="min-h-[100px]"
                  onChange={(e) => setEditedValue(e.target.value)}
                  value={editedValue}
                />
              ) : (
                <div className="whitespace-pre-wrap break-words">
                  {selectedKeyInfo.elements}
                </div>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

