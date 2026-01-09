import { useState } from "react"
import { Check, Pencil, X, Trash } from "lucide-react"
import { CustomTooltip } from "./custom-tooltip"
import { Button } from "./button"
import DeleteModal from "./delete-modal"
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
  readOnly: boolean;
}

export default function KeyDetailsSet(
  { selectedKey, selectedKeyInfo, connectionId, readOnly = false }: KeyDetailsSetProps,
) {
  const dispatch = useAppDispatch()
  const [isEditable, setIsEditable] = useState(false)
  const [editedSetValues, setEditedSetValues] = useState<string[]>([])
  const [deletedValues, setDeletedValues] = useState<Set<string>>(new Set())
  const [pendingDeleteValue, setPendingDeleteValue] = useState<string | null>(null)

  const handleEdit = () => {
    if (isEditable) {
      // Cancel edit
      setIsEditable(false)
      setEditedSetValues([])
      setDeletedValues(new Set())
    } else {
      // Start editing
      setEditedSetValues([...selectedKeyInfo.elements])
      setDeletedValues(new Set())
      setIsEditable(true)
    }
  }

  const handleSave = () => {
    const setUpdates = editedSetValues
      .map((newValue, index) => ({
        oldValue: selectedKeyInfo.elements[index],
        newValue,
      }))
      .filter((update) =>
        !deletedValues.has(update.oldValue) &&
        update.oldValue !== update.newValue,
      )

    const deletedSetItems = Array.from(deletedValues)

    dispatch(updateKeyRequested({
      connectionId: connectionId,
      key: selectedKey,
      keyType: "set",
      setUpdates,
      deletedSetItems,
    }))
    setIsEditable(false)
    setEditedSetValues([])
    setDeletedValues(new Set())
  }

  const handleSetFieldChange = (index: number, newValue: string) => {
    setEditedSetValues((prev) => {
      const updatedSet = [...prev]
      updatedSet[index] = newValue
      return updatedSet
    })
  }

  const handleDeleteElement = (value: string) => {
    setPendingDeleteValue(value)
  }

  const confirmDeleteElement = () => {
    if (pendingDeleteValue) {
      setDeletedValues((prev) => new Set(prev).add(pendingDeleteValue))
      setPendingDeleteValue(null)
    }
  }

  const cancelDeleteElement = () => {
    setPendingDeleteValue(null)
  }

  return (
    <div className="flex items-center justify-center w-full p-4">
      <table className="table-auto w-full overflow-visible">
        <thead className="bg-tw-dark-border opacity-85 text-white">
          <tr>
            <th className="w-1/2 py-3 px-4 text-left font-semibold">
              Index
            </th>
            <th className="w-1/2 py-3 px-4 text-left font-semibold">
              Value
            </th>
            <th className="">
              {!readOnly && (isEditable ? (
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
              ))}
              
            </th>
          </tr>
        </thead>
        <tbody>
          {selectedKeyInfo.elements
            .map((element: string, index: number) => ({ element, index }))
            .filter(({ element }) => !deletedValues.has(element))
            .map(({ element, index }) => (
              <tr key={index}>
                <td className="py-3 px-4 border-b border-tw-dark-border font-light dark:text-white">
                  {index}
                </td>
                <td className="py-3 px-4 border-b border-tw-dark-border font-light dark:text-white">
                  {isEditable ? (
                    <div className="flex gap-2">
                      <input
                        className="w-full p-2 dark:bg-tw-dark-bg dark:border-tw-dark-border border rounded focus:outline-none
                                          focus:ring-2 focus:ring-blue-500"
                        onChange={(e) => handleSetFieldChange(index, e.target.value)}
                        type="text"
                        value={editedSetValues[index] || ""}
                      />
                      <div className="relative">
                        <CustomTooltip content="Delete element">
                          <Button
                            onClick={() => handleDeleteElement(element)}
                            variant={"destructiveGhost"}
                          >
                            <Trash/>
                          </Button>
                        </CustomTooltip>
                        {pendingDeleteValue === element && (
                          <DeleteModal
                            itemName={element}
                            message="You are deleting element:"
                            onCancel={cancelDeleteElement}
                            onConfirm={confirmDeleteElement}
                          />
                        )}
                      </div>
                    </div>
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
