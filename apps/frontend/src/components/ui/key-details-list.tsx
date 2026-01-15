import { useState } from "react"
import { Check, Pencil, X, Trash, Plus } from "lucide-react"
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

interface NewItem {
  tempId: string;
  value: string;
}

export default function KeyDetailsList(
  { selectedKey, selectedKeyInfo, connectionId, readOnly = false }: KeyDetailsListProps,
) {
  const dispatch = useAppDispatch()
  const [isEditable, setIsEditable] = useState(false)
  const [editedListValues, setEditedListValues] = useState<string[]>([])
  const [deletedIndices, setDeletedIndices] = useState<Set<number>>(new Set())
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null)
  const [newItems, setNewItems] = useState<NewItem[]>([])

  const handleEdit = () => {
    if (isEditable) {
      // Cancel edit
      setIsEditable(false)
      setEditedListValues([])
      setDeletedIndices(new Set())
      setNewItems([])
    } else {
      // Start editing
      setEditedListValues([...selectedKeyInfo.elements])
      setDeletedIndices(new Set())
      setNewItems([])
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

    const newListItems = newItems
      // ensure no empty values are added
      .filter((item) => item.value.trim() !== "")
      .map((item) => item.value)

    dispatch(updateKeyRequested({
      connectionId: connectionId,
      key: selectedKey,
      keyType: "list",
      listUpdates,
      deletedListItems,
      newListItems,
    }))
    setIsEditable(false)
    setEditedListValues([])
    setDeletedIndices(new Set())
    setNewItems([])
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

  const handleAddNewItem = () => {
    const tempId = `new-${Date.now()}`
    setNewItems((prev) => [...prev, { tempId, value: "" }])
  }

  const handleNewItemChange = (tempId: string, newValue: string) => {
    setNewItems((prev) =>
      prev.map((item) =>
        item.tempId === tempId ? { ...item, value: newValue } : item,
      ),
    )
  }

  const handleRemoveNewItem = (tempId: string) => {
    setNewItems((prev) => prev.filter((item) => item.tempId !== tempId))
  }

  return (
    <div className="flex items-center justify-center w-full p-4">
      <div className="w-full">
        <div className="grid grid-cols-4 gap-4 bg-tw-dark-border opacity-85 text-white items-center py-1 px-4">
          <div className="font-semibold text-left">Index</div>
          <div className="col-span-2 font-semibold text-left">Elements</div>
          <div className="flex justify-end gap-1">
            {!readOnly && (isEditable ? (
              <>
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
              </>
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
          </div>
        </div>
        {selectedKeyInfo.elements
          .map((element: string, index: number) => ({ element, index }))
          .filter(({ index }) => !deletedIndices.has(index))
          .map(({ element, index }) => (
            <div className="grid grid-cols-4 gap-4 py-3 px-4 border-b border-tw-dark-border font-light dark:text-white" key={index}>
              <div>{index}</div>
              <div className="col-span-3">
                {isEditable ? (
                  <div className="flex gap-2 relative">
                    <input
                      className="w-full p-2 dark:bg-tw-dark-bg dark:border-tw-dark-border border rounded focus:outline-none
                                        focus:ring-2 focus:ring-tw-primary"
                      onChange={(e) => handleListFieldChange(index, e.target.value)}
                      type="text"
                      value={editedListValues[index] || ""}
                    />
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
                ) : (
                  String(element)
                )}
              </div>
            </div>
          ))}
        {isEditable && newItems.map((newItem) => (
          <div className="grid grid-cols-4 gap-4 py-3 px-4 border-b border-tw-dark-border font-light dark:text-white" key={newItem.tempId}>
            <div>New</div>
            <div className="col-span-3">
              <div className="flex gap-2">
                <input
                  className="w-full p-2 dark:bg-tw-dark-bg dark:border-tw-dark-border border rounded focus:outline-none
                                    focus:ring-2 focus:ring-tw-primary"
                  onChange={(e) => handleNewItemChange(newItem.tempId, e.target.value)}
                  placeholder="Enter value"
                  type="text"
                  value={newItem.value}
                />
                <CustomTooltip content="Remove item">
                  <Button
                    onClick={() => handleRemoveNewItem(newItem.tempId)}
                    variant={"destructiveGhost"}
                  >
                    <X/>
                  </Button>
                </CustomTooltip>
              </div>
            </div>
          </div>
        ))}
        {isEditable && (
          <div className="py-3 px-4">
            <Button
              className="w-full"
              onClick={handleAddNewItem}
              variant={"secondary"}
            >
              <Plus className="mr-2" /> Add
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
