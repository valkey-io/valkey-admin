import { useState } from "react"
import { Check, Pencil, X } from "lucide-react"
import { CustomTooltip } from "./custom-tooltip"
import { Button } from "./button"
import { useAppDispatch } from "@/hooks/hooks"
import { updateKeyRequested } from "@/state/valkey-features/keys/keyBrowserSlice"

interface KeyDetailsListProps {
  selectedKey: string;
  selectedKeyInfo: {
    name: string;
    type: "list";
    ttl: number;
    size: number;
    collectionSize?: number;
    elements: string[];
  };
  connectionId: string;
}

export default function KeyDetailsList(
  { selectedKey, selectedKeyInfo, connectionId }: KeyDetailsListProps,
) {
  const dispatch = useAppDispatch()
  const [isEditable, setIsEditable] = useState(false)
  const [editedListValues, setEditedListValues] = useState<string[]>([])

  const handleEdit = () => {
    if (isEditable) {
      // Cancel edit
      setIsEditable(false)
      setEditedListValues([])
    } else {
      // Start editing
      setEditedListValues([...selectedKeyInfo.elements])
      setIsEditable(true)
    }
  }

  const handleSave = () => {
    // creating listUpdates array with only changed values
    const listUpdates = editedListValues
      .map((value, index) => ({
        index,
        value,
      }))
      .filter((update, index) => update.value !== selectedKeyInfo.elements[index])

    dispatch(updateKeyRequested({
      connectionId: connectionId,
      key: selectedKey,
      keyType: "list",
      listUpdates,
    }))
    setIsEditable(false)
    setEditedListValues([])
  }

  const handleListFieldChange = (index: number, newValue: string) => {
    setEditedListValues((prev) => {
      const updatedList = [...prev]
      updatedList[index] = newValue
      return updatedList
    })
  }

  return (
    <div className="flex items-center justify-center w-full p-4">
      <table className="table-auto w-full overflow-hidden">
        <thead className="bg-tw-dark-border opacity-85 text-white">
          <tr>
            <th className="w-1/2 py-3 px-4 text-left font-semibold">
              Index
            </th>
            <th className="w-1/2 py-3 px-4 text-left font-semibold">
              Elements
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
          {selectedKeyInfo.elements.map((element: string, index: number) => (
            <tr key={index}>
              <td className="py-3 px-4 border-b border-tw-dark-border font-light dark:text-white">
                {index}
              </td>
              <td className="py-3 px-4 border-b border-tw-dark-border font-light dark:text-white">
                {isEditable ? (
                  <input
                    className="w-full p-2 dark:bg-tw-dark-bg dark:border-tw-dark-border border rounded focus:outline-none 
                                        focus:ring-2 focus:ring-blue-500"
                    onChange={(e) => handleListFieldChange(index, e.target.value)}
                    type="text"
                    value={editedListValues[index] || ""}
                  />
                ) : (
                  String(element)
                )}
              </td>
              <td className="py-3 px-4 border-b border-tw-dark-border font-light dark:text-white"></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
