import { useState } from "react"
import { Trash, Plus, X } from "lucide-react"
import { CustomTooltip } from "../../ui/tooltip"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { EditActionButtons } from "../../ui/edit-action-buttons"
import DeleteModal from "../../ui/delete-modal"
import { Typography } from "../../ui/typography"
import { BinaryNotice, BinaryValue } from "./binary-value"
import { useAppDispatch } from "@/hooks/hooks"
import { updateKeyRequested } from "@/state/valkey-features/keys/keyBrowserSlice"
import { cn } from "@/lib/utils"

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
    binaryKeyIndexes?: number[];
    binaryValueIndexes?: number[];
  };
  connectionId: string;
  readOnly:boolean;
}

interface NewField {
  tempId: string;
  key: string;
  value: string;
}

/**
 * Shows and edits a hash's fields. Binary field names and values are badged and read-only;
 * a text field holding a binary value can still be deleted by name.
 */
export default function KeyDetailsHash(
  { selectedKey, selectedKeyInfo, connectionId, readOnly = false }: KeyDetailsHashProps,
) {
  const dispatch = useAppDispatch()
  const [isEditable, setIsEditable] = useState(false)
  const [editedHashValue, setEditedHashValue] = useState<{ [key: string]: string }>({})
  const [deletedHashFields, setDeletedHashFields] = useState<Set<string>>(new Set())
  const [pendingDeleteField, setPendingDeleteField] = useState<string | null>(null)
  const [newFields, setNewFields] = useState<NewField[]>([])
  const binaryKeyIndexes = new Set(selectedKeyInfo.binaryKeyIndexes)
  const binaryValueIndexes = new Set(selectedKeyInfo.binaryValueIndexes)
  const binaryFieldCount = new Set([...binaryKeyIndexes, ...binaryValueIndexes]).size
  const isTextField = (index: number) => !binaryKeyIndexes.has(index) && !binaryValueIndexes.has(index)

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
      // Binary fields are left out so saving never writes their escaped text back as a new field
      selectedKeyInfo.elements.forEach((element: ElementInfo, index: number) => {
        if (isTextField(index)) initialHashValue[element.key] = element.value
      })
      setEditedHashValue(initialHashValue)
      setDeletedHashFields(new Set())
      setNewFields([])
      setIsEditable(true)
    }
  }

  const handleSave = () => {
    const originalValues = new Map(selectedKeyInfo.elements.map((element: ElementInfo) => [element.key, element.value]))
    // combine changed existing fields and new fields; unchanged fields are not sent, so a field that
    // turned binary after the key loaded is never overwritten unless the user edited it
    const existingFields = Object.entries(editedHashValue)
      .filter(([field, value]) => !deletedHashFields.has(field) && value !== originalValues.get(field))
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

    const fields = [...existingFields, ...newFieldsToAdd]
    // Nothing changed: the server rejects an update with no fields, so just leave edit mode
    if (fields.length > 0 || deletedHashFields.size > 0) {
      dispatch(updateKeyRequested({
        connectionId: connectionId,
        key: selectedKey,
        keyType: "hash",
        fields,
        deletedHashFields: Array.from(deletedHashFields),
      }))
    }
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
        <div className={cn("grid grid-cols-4 gap-4 items-center py-1 px-4", "bg-muted/60 text-foreground")}>
          <Typography className="text-left" variant="label">Key</Typography>
          <Typography className="col-span-2 text-left" variant="label">Value</Typography>
          <div className="flex justify-end gap-1">
            <EditActionButtons
              isEditable={isEditable}
              onEdit={handleEdit}
              onSave={handleSave}
              readOnly={readOnly}
            />
          </div>
        </div>
        {binaryFieldCount > 0 && (
          <div className="px-4 pt-3">
            <BinaryNotice count={binaryFieldCount} noun="fields" total={selectedKeyInfo.elements.length} />
          </div>
        )}
        {selectedKeyInfo.elements
          .map((element: ElementInfo, index: number) => ({ element, index }))
          .filter(({ element }) => !deletedHashFields.has(element.key))
          .map(({ element, index }) => (
            <div className={cn("grid grid-cols-4 gap-4 py-3 px-4 border-b border-border text-foreground")} key={index}>
              <BinaryValue isBinary={binaryKeyIndexes.has(index)} value={element.key} />
              <div className="col-span-3">
                {isEditable && !binaryKeyIndexes.has(index) ? (
                  <div className="flex gap-2 relative">
                    {binaryValueIndexes.has(index) ? (
                      <BinaryValue className="flex-1" isBinary value={element.value} />
                    ) : (
                      <Input
                        aria-label="Edit hash field value"
                        onChange={(e) => handleHashFieldChange(element.key, e.target.value)}
                        type="text"
                        value={editedHashValue[element.key] || ""}
                      />
                    )}
                    <CustomTooltip content="Delete field">
                      <Button
                        aria-label="Delete field"
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
                  <BinaryValue isBinary={binaryValueIndexes.has(index)} value={element.value} />
                )}
              </div>
            </div>
          ))}
        {isEditable && newFields.map((newField) => (
          <div className={cn("grid grid-cols-4 gap-4 py-3 px-4 border-b border-border text-foreground")} key={newField.tempId}>
            <div>
              <Input
                onChange={(e) => handleNewFieldKeyChange(newField.tempId, e.target.value)}
                placeholder="Enter key"
                type="text"
                value={newField.key}
              />
            </div>
            <div className="col-span-3">
              <div className="flex gap-2">
                <Input
                  onChange={(e) => handleNewFieldValueChange(newField.tempId, e.target.value)}
                  placeholder="Enter value"
                  type="text"
                  value={newField.value}
                />
                <CustomTooltip content="Remove field">
                  <Button
                    aria-label="Remove new field"
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
              aria-label="Add new field"
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
