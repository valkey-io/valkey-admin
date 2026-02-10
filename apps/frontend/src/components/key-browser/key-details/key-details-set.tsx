import { useState } from "react"
import { Trash, Plus, X } from "lucide-react"
import { CustomTooltip } from "../../ui/tooltip"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { EditActionButtons } from "../../ui/edit-action-buttons"
import DeleteModal from "../../ui/delete-modal"
import { useAppDispatch } from "@/hooks/hooks"
import { updateKeyRequested } from "@/state/valkey-features/keys/keyBrowserSlice"
import { cn } from "@/lib/utils"

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

interface NewItem {
  tempId: string;
  value: string;
}

export default function KeyDetailsSet(
  { selectedKey, selectedKeyInfo, connectionId, readOnly = false }: KeyDetailsSetProps,
) {
  const dispatch = useAppDispatch()
  const [isEditable, setIsEditable] = useState(false)
  const [editedSetValues, setEditedSetValues] = useState<string[]>([])
  const [deletedValues, setDeletedValues] = useState<Set<string>>(new Set())
  const [pendingDeleteValue, setPendingDeleteValue] = useState<string | null>(null)
  const [newItems, setNewItems] = useState<NewItem[]>([])

  const handleEdit = () => {
    if (isEditable) {
      // Cancel edit
      setIsEditable(false)
      setEditedSetValues([])
      setDeletedValues(new Set())
      setNewItems([])
    } else {
      // Start editing
      setEditedSetValues([...selectedKeyInfo.elements])
      setDeletedValues(new Set())
      setNewItems([])
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

    const newSetItems = newItems
      // ensure no empty values are added
      .filter((item) => item.value.trim() !== "")
      .map((item) => item.value)

    dispatch(updateKeyRequested({
      connectionId: connectionId,
      key: selectedKey,
      keyType: "set",
      setUpdates,
      deletedSetItems,
      newSetItems,
    }))
    setIsEditable(false)
    setEditedSetValues([])
    setDeletedValues(new Set())
    setNewItems([])
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
        <div className={cn("grid grid-cols-4 gap-4 items-center py-1 px-4", "bg-muted/60 text-foreground")}>
          <div className="font-semibold text-left">Index</div>
          <div className="col-span-2 font-semibold text-left">Value</div>
          <div className="flex justify-end gap-1">
            <EditActionButtons
              isEditable={isEditable}
              onEdit={handleEdit}
              onSave={handleSave}
              readOnly={readOnly}
            />
          </div>
        </div>
        {selectedKeyInfo.elements
          .map((element: string, index: number) => ({ element, index }))
          .filter(({ element }) => !deletedValues.has(element))
          .map(({ element, index }) => (
            <div className={cn("grid grid-cols-4 gap-4 py-3 px-4 border-b border-border font-light text-foreground")} key={index}>
              <div>{index}</div>
              <div className="col-span-3">
                {isEditable ? (
                  <div className="flex gap-2 relative">
                    <Input
                      onChange={(e) => handleSetFieldChange(index, e.target.value)}
                      type="text"
                      value={editedSetValues[index] || ""}
                    />
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
                ) : (
                  String(element)
                )}
              </div>
            </div>
          ))}
        {isEditable && newItems.map((newItem) => (
          <div className={cn("grid grid-cols-4 gap-4 py-3 px-4 border-b border-border font-light text-foreground")} key={newItem.tempId}>
            <div>New</div>
            <div className="col-span-3">
              <div className="flex gap-2">
                <Input
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
