import { useState } from "react"
import { Check, Pencil, X, Trash } from "lucide-react"
import { CustomTooltip } from "./custom-tooltip"
import { Button } from "./button"
import DeleteModal from "./delete-modal"
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
  readOnly: boolean;
}

export default function KeyDetailsList(
  { selectedKey, selectedKeyInfo, connectionId, readOnly = false }: KeyDetailsListProps,
) {
  const dispatch = useAppDispatch()
  const [isEditable, setIsEditable] = useState(false)
  const [editedListValues, setEditedListValues] = useState<string[]>([])
  const [deletedIndices, setDeletedIndices] = useState<Set<number>>(new Set())
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null)

  const handleEdit = () => {
    if (isEditable) {
      // Cancel edit
      setIsEditable(false)
      setEditedListValues([])
      setDeletedIndices(new Set())
    } else {
      // Start editing
      setEditedListValues([...selectedKeyInfo.elements])
      setDeletedIndices(new Set())
      setIsEditable(true)
    }
  }

  const handleSave = () => {
    const listUpdates = editedListValues
      .map((value, index) => ({
        index,
        value,
      }))
      .filter((update, index) =>
        !deletedIndices.has(index) &&
        update.value !== selectedKeyInfo.elements[index],
      )

    const deletedListItems = Array.from(deletedIndices).map((index) => ({
      index,
      value: selectedKeyInfo.elements[index],
    }))

    dispatch(updateKeyRequested({
      connectionId: connectionId,
      key: selectedKey,
      keyType: "list",
      listUpdates,
      deletedListItems,
    }))
    setIsEditable(false)
    setEditedListValues([])
    setDeletedIndices(new Set())
  }

  const handleListFieldChange = (index: number, newValue: string) => {
    setEditedListValues((prev) => {
      const updatedList = [...prev]
      updatedList[index] = newValue
      return updatedList
    })
  }

  const handleDeleteElement = (index: number) => {
    setPendingDeleteIndex(index)
  }

  const confirmDeleteElement = () => {
    if (pendingDeleteIndex !== null) {
      setDeletedIndices((prev) => new Set(prev).add(pendingDeleteIndex))
      setPendingDeleteIndex(null)
    }
  }

  const cancelDeleteElement = () => {
    setPendingDeleteIndex(null)
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
              Elements
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
            .filter(({ index }) => !deletedIndices.has(index))
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
                        onChange={(e) => handleListFieldChange(index, e.target.value)}
                        type="text"
                        value={editedListValues[index] || ""}
                      />
                      <div className="relative">
                        <CustomTooltip content="Delete element">
                          <Button
                            onClick={() => handleDeleteElement(index)}
                            variant={"destructiveGhost"}
                          >
                            <Trash/>
                          </Button>
                        </CustomTooltip>
                        {pendingDeleteIndex === index && (
                          <DeleteModal
                            itemName={`Index ${index}`}
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
