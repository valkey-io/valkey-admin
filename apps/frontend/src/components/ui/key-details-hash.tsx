import { useState } from "react"
import { Check, Pencil, X } from "lucide-react"
import { CustomTooltip } from "./custom-tooltip"
import { Button } from "./button"
import { useAppDispatch } from "@/hooks/hooks"
import { updateKeyRequested } from "@/state/valkey-features/keys/keyBrowserSlice"

interface ElementInfo {
  key: string;
  value: string;
}

interface KeyDetailsHashProps {
  selectedKey: string;
  selectedKeyInfo: {
    name: string;
    type: "hash";
    ttl: number;
    size: number;
    collectionSize?: number;
    elements: ElementInfo[];
  };
  connectionId: string;
}

export default function KeyDetailsHash(
  { selectedKey, selectedKeyInfo, connectionId }: KeyDetailsHashProps,
) {
  const dispatch = useAppDispatch()
  const [isEditable, setIsEditable] = useState(false)
  const [editedHashValue, setEditedHashValue] = useState<{ [key: string]: string }>({})

  const handleEdit = () => {
    if (isEditable) {
      // Cancel edit
      setIsEditable(false)
      setEditedHashValue({})
    } else {
      // Start editing
      const initialHashValue: { [key: string]: string } = {}
      selectedKeyInfo.elements.forEach((element: ElementInfo) => {
        initialHashValue[element.key] = element.value
      })
      setEditedHashValue(initialHashValue)
      setIsEditable(true)
    }
  }

  const handleSave = () => {
    dispatch(updateKeyRequested({
      connectionId: connectionId,
      key: selectedKey,
      keyType: "hash",
      fields: Object.entries(editedHashValue).map(([field, value]) => ({
        field,
        value,
      })),
    }))
    setIsEditable(false)
    setEditedHashValue({})
  }

  const handleHashFieldChange = (fieldKey: string, newValue: string) => {
    setEditedHashValue((prev) => ({
      ...prev,
      [fieldKey]: newValue,
    }))
  }

  return (
    <div className="flex items-center justify-center w-full p-4">
      <table className="table-auto w-full overflow-hidden">
        <thead className="bg-tw-dark-border opacity-85 text-white">
          <tr>
            <th className="w-1/2 py-3 px-4 text-left font-semibold">
              Key
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
          {selectedKeyInfo.elements.map((element: ElementInfo, index: number) => (
            <tr key={index}>
              <td className="py-3 px-4 border-b border-tw-dark-border font-light dark:text-white">
                {element.key}
              </td>
              <td className="py-3 px-4 border-b border-tw-dark-border font-light dark:text-white">
                {isEditable ? (
                  <input
                    className="w-full p-2 dark:bg-tw-dark-bg dark:border-tw-dark-border border rounded focus:outline-none 
                                        focus:ring-2 focus:ring-blue-500"
                    onChange={(e) => handleHashFieldChange(element.key, e.target.value)}
                    type="text"
                    value={editedHashValue[element.key] || ""}
                  />
                ) : (
                  element.value
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
