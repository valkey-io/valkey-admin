import { useState } from "react"
import { Check, Pencil, X } from "lucide-react"
import { CustomTooltip } from "./custom-tooltip"
import { Button } from "./button"
import { useAppDispatch } from "@/hooks/hooks"
import { updateKeyRequested } from "@/state/valkey-features/keys/keyBrowserSlice"

interface KeyDetailsSetProps {
  selectedKey: string;
  selectedKeyInfo: {
    name: string;
    type: "set";
    ttl: number;
    size: number;
    collectionSize?: number;
    elements: string[];
  };
  connectionId: string;
}

export default function KeyDetailsSet(
  { selectedKey, selectedKeyInfo, connectionId }: KeyDetailsSetProps,
) {
  const dispatch = useAppDispatch()
  const [isEditable, setIsEditable] = useState(false)
  const [editedSetValues, setEditedSetValues] = useState<string[]>([])

  const handleEdit = () => {
    if (isEditable) {
      // Cancel edit
      setIsEditable(false)
      setEditedSetValues([])
    } else {
      // Start editing
      setEditedSetValues([...selectedKeyInfo.elements])
      setIsEditable(true)
    }
  }

  const handleSave = () => {
    // creating setUpdates array with oldValue and newValue pairs
    const setUpdates = editedSetValues
      .map((newValue, index) => ({
        oldValue: selectedKeyInfo.elements[index],
        newValue,
      }))
      .filter((update) => update.oldValue !== update.newValue)

    dispatch(updateKeyRequested({
      connectionId: connectionId,
      key: selectedKey,
      keyType: "set",
      setUpdates,
    }))
    setIsEditable(false)
    setEditedSetValues([])
  }

  const handleSetFieldChange = (index: number, newValue: string) => {
    setEditedSetValues((prev) => {
      const updatedSet = [...prev]
      updatedSet[index] = newValue
      return updatedSet
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
                    onChange={(e) => handleSetFieldChange(index, e.target.value)}
                    type="text"
                    value={editedSetValues[index] || ""}
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
