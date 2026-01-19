import { useState } from "react"
import { Check, Pencil, X, Trash, Plus } from "lucide-react"
import { CustomTooltip } from "./custom-tooltip"
import { Button } from "./button"
import DeleteModal from "./delete-modal"
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
  readOnly:boolean;
}

interface NewField {
  tempId: string;
  key: string;
  value: string;
}

export default function KeyDetailsHash(
  { selectedKey, selectedKeyInfo, connectionId, readOnly = false }: KeyDetailsHashProps,
) {
  const dispatch = useAppDispatch()
  const [isEditable, setIsEditable] = useState(false)
  const [editedHashValue, setEditedHashValue] = useState<{ [key: string]: string }>({})
  const [deletedHashFields, setDeletedHashFields] = useState<Set<string>>(new Set())
  const [pendingDeleteField, setPendingDeleteField] = useState<string | null>(null)
  const [newFields, setNewFields] = useState<NewField[]>([])

  const handleEdit = () => {
    if (isEditable) {
      // Cancel edit
      setIsEditable(false)
      setEditedHashValue({})
      setDeletedHashFields(new Set())
      setNewFields([])
    } else {
      // Start editing
      const initialHashValue: { [key: string]: string } = {}
      selectedKeyInfo.elements.forEach((element: ElementInfo) => {
        initialHashValue[element.key] = element.value
      })
      setEditedHashValue(initialHashValue)
      setDeletedHashFields(new Set())
      setNewFields([])
      setIsEditable(true)
    }
  }

  const handleSave = () => {
    // combine existing edited fields and new fields
    const existingFields = Object.entries(editedHashValue)
      .filter(([field]) => !deletedHashFields.has(field))
      .map(([field, value]) => ({
        field,
        value,
      }))

    const newFieldsToAdd = newFields
      // to ensure no empty keys are added
      .filter((nf) => nf.key.trim() !== "")
      .map((nf) => ({
        field: nf.key,
        value: nf.value,
      }))

    dispatch(updateKeyRequested({
      connectionId: connectionId,
      key: selectedKey,
      keyType: "hash",
      fields: [...existingFields, ...newFieldsToAdd],
      deletedHashFields: Array.from(deletedHashFields),
    }))
    setIsEditable(false)
    setEditedHashValue({})
    setDeletedHashFields(new Set())
    setNewFields([])
  }

  const handleHashFieldChange = (fieldKey: string, newValue: string) => {
    setEditedHashValue((prev) => ({
      ...prev,
      [fieldKey]: newValue,
    }))
  }

  const handleDeleteHashField = (fieldKey: string) => {
    setPendingDeleteField(fieldKey)
  }

  const confirmDeleteHashField = () => {
    if (pendingDeleteField) {
      setDeletedHashFields((prev) => new Set(prev).add(pendingDeleteField))
      setPendingDeleteField(null)
    }
  }

  const cancelDeleteHashField = () => {
    setPendingDeleteField(null)
  }

  const handleAddNewField = () => {
    const tempId = `new-${Date.now()}`
    setNewFields((prev) => [...prev, { tempId, key: "", value: "" }])
  }

  const handleNewFieldKeyChange = (tempId: string, newKey: string) => {
    setNewFields((prev) =>
      prev.map((field) =>
        field.tempId === tempId ? { ...field, key: newKey } : field,
      ),
    )
  }

  const handleNewFieldValueChange = (tempId: string, newValue: string) => {
    setNewFields((prev) =>
      prev.map((field) =>
        field.tempId === tempId ? { ...field, value: newValue } : field,
      ),
    )
  }

  const handleRemoveNewField = (tempId: string) => {
    setNewFields((prev) => prev.filter((field) => field.tempId !== tempId))
  }

  return (
    <div className="flex items-center justify-center w-full p-4">
      <div className="w-full">
        <div className="grid grid-cols-4 gap-4 bg-tw-dark-border opacity-85 text-white items-center py-1 px-4">
          <div className="font-semibold text-left">Key</div>
          <div className="col-span-2 font-semibold text-left">Value</div>
          <div className="flex justify-end gap-1">
            {!readOnly && (isEditable ? (
              <>
                <CustomTooltip content="Save" side={"left"}>
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
          .filter((element: ElementInfo) => !deletedHashFields.has(element.key))
          .map((element: ElementInfo, index: number) => (
            <div className="grid grid-cols-4 gap-4 py-3 px-4 border-b border-tw-dark-border font-light dark:text-white" key={index}>
              <div>{element.key}</div>
              <div className="col-span-3">
                {isEditable ? (
                  <div className="flex gap-2 relative">
                    <input
                      className="w-full p-2 dark:bg-tw-dark-bg dark:border-tw-dark-border border rounded focus:outline-none
                                        focus:ring-2 focus:ring-tw-primary"
                      onChange={(e) => handleHashFieldChange(element.key, e.target.value)}
                      type="text"
                      value={editedHashValue[element.key] || ""}
                    />
                    <CustomTooltip content="Delete field">
                      <Button
                        onClick={() => handleDeleteHashField(element.key)}
                        variant={"destructiveGhost"}
                      >
                        <Trash/>
                      </Button>
                    </CustomTooltip>
                    {pendingDeleteField === element.key && (
                      <DeleteModal
                        itemName={element.key}
                        message="You are deleting field:"
                        onCancel={cancelDeleteHashField}
                        onConfirm={confirmDeleteHashField}
                      />
                    )}
                  </div>
                ) : (
                  element.value
                )}
              </div>
            </div>
          ))}
        {isEditable && newFields.map((newField) => (
          <div className="grid grid-cols-4 gap-4 py-3 px-4 border-b border-tw-dark-border font-light dark:text-white" key={newField.tempId}>
            <div>
              <input
                className="w-full p-2 dark:bg-tw-dark-bg dark:border-tw-dark-border border rounded focus:outline-none
                                  focus:ring-2 focus:ring-tw-primary"
                onChange={(e) => handleNewFieldKeyChange(newField.tempId, e.target.value)}
                placeholder="Enter key"
                type="text"
                value={newField.key}
              />
            </div>
            <div className="col-span-3">
              <div className="flex gap-2">
                <input
                  className="w-full p-2 dark:bg-tw-dark-bg dark:border-tw-dark-border border rounded focus:outline-none
                                      focus:ring-2 focus:ring-tw-primary"
                  onChange={(e) => handleNewFieldValueChange(newField.tempId, e.target.value)}
                  placeholder="Enter value"
                  type="text"
                  value={newField.value}
                />
                <CustomTooltip content="Remove field">
                  <Button
                    onClick={() => handleRemoveNewField(newField.tempId)}
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
              onClick={handleAddNewField}
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
