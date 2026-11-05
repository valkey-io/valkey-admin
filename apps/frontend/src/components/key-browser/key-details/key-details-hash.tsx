import { useState } from "react"
import { Trash, Plus, X } from "lucide-react"
import { CustomTooltip } from "../../ui/tooltip"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { EditActionButtons } from "../../ui/edit-action-buttons"
import DeleteModal from "../../ui/delete-modal"
import { Badge } from "../../ui/badge"
import { Typography } from "../../ui/typography"
import { useAppDispatch } from "@/hooks/hooks"
import { updateKeyRequested } from "@/state/valkey-features/keys/keyBrowserSlice"
import { cn } from "@/lib/utils"

interface ElementInfo {
  key: string;
  value: string;
  isKeyBinary?: boolean;
  isValueBinary?: boolean;
  isBinary?: boolean;
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
        if (!element.isValueBinary && !element.isKeyBinary && !element.isBinary) {
          initialHashValue[element.key] = element.value
        }
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
      .filter(([field]) => {
        if (deletedHashFields.has(field)) return false
        const orig = selectedKeyInfo.elements.find((el) => el.key === field)
        return !orig?.isValueBinary && !orig?.isKeyBinary && !orig?.isBinary
      })
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
        {selectedKeyInfo.elements
          .filter((element: ElementInfo) => !deletedHashFields.has(element.key))
          .map((element: ElementInfo, index: number) => {
            const isBinary = element.isValueBinary || element.isKeyBinary || element.isBinary
            return (
              <div className={cn("grid grid-cols-4 gap-4 py-3 px-4 border-b border-border text-foreground")} key={index}>
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <Typography className="truncate" variant="code">{element.key}</Typography>
                  {element.isKeyBinary && (
                    <CustomTooltip content="Binary field name">
                      <Badge className="text-[10px] px-1 py-0" variant="secondary">binary</Badge>
                    </CustomTooltip>
                  )}
                </div>
                <div className="col-span-3">
                  {isEditable ? (
                    isBinary ? (
                      <div className="flex items-center gap-2">
                        <Typography className="whitespace-pre-wrap break-words text-muted-foreground" variant="code">
                          {element.value}
                        </Typography>
                        <CustomTooltip content="Binary values can't be edited as text">
                          <Badge className="text-[10px] px-1 py-0" variant="secondary">binary</Badge>
                        </CustomTooltip>
                      </div>
                    ) : (
                      <div className="flex gap-2 relative">
                        <Input
                          aria-label="Edit hash field value"
                          onChange={(e) => handleHashFieldChange(element.key, e.target.value)}
                          type="text"
                          value={editedHashValue[element.key] || ""}
                        />
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
                    )
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Typography className="whitespace-pre-wrap break-words" variant="code">{element.value}</Typography>
                      {element.isValueBinary && (
                        <CustomTooltip content="Binary value">
                          <Badge className="text-[10px] px-1 py-0" variant="secondary">binary</Badge>
                        </CustomTooltip>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
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
