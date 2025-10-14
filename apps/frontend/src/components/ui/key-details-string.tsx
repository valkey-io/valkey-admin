import { useState } from "react"
import { Check, Pencil, X } from "lucide-react"
import { CustomTooltip } from "./custom-tooltip"
import { Button } from "./button"
import { useAppDispatch } from "@/hooks/hooks"
import { updateKeyRequested } from "@/state/valkey-features/keys/keyBrowserSlice"

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
}

export default function KeyDetailsString(
  { selectedKey, selectedKeyInfo, connectionId }: KeyDetailsStringProps,
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
        <thead className="bg-tw-dark-border opacity-85 text-white">
          <tr>
            <th className="w-full py-3 px-4 text-left font-semibold">
              Value
            </th>
            <th className="">
              {isEditable ? (
                <div className="flex gap-1">
                  <CustomTooltip content="Save">
                    <Button
                      className="text-tw-primary hover:text-tw-primary"
                      onClick={handleSave}
                      variant={"secondary"}
                    >
                      <Check />
                    </Button>
                  </CustomTooltip>
                  <CustomTooltip content="Cancel">
                    <Button
                      onClick={handleEdit}
                      variant={"destructiveGhost"}
                    >
                      <X />
                    </Button>
                  </CustomTooltip>
                </div>
              ) : (
                <CustomTooltip content="Edit">
                  <Button
                    className="mr-1"
                    onClick={handleEdit}
                    variant={"ghost"}
                  >
                    <Pencil />
                  </Button>
                </CustomTooltip>
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-3 px-4 font-light dark:text-white" colSpan={2}>
              {isEditable ? (
                <textarea
                  autoFocus
                  className="w-full p-2 dark:bg-tw-dark-bg dark:border-tw-dark-border border rounded focus:outline-none 
                    focus:ring-2 focus:ring-blue-500 min-h-[100px]"
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

