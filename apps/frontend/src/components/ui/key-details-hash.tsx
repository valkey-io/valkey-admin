import { useState } from "react"
import { Check, Pencil, X, Trash } from "lucide-react"
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

export default function KeyDetailsHash(
  { selectedKey, selectedKeyInfo, connectionId, readOnly = false }: KeyDetailsHashProps,
) {
  const dispatch = useAppDispatch()
  const [isEditable, setIsEditable] = useState(false)
  const [editedHashValue, setEditedHashValue] = useState<{ [key: string]: string }>({})
  const [deletedHashFields, setDeletedHashFields] = useState<Set<string>>(new Set())
  const [pendingDeleteField, setPendingDeleteField] = useState<string | null>(null)

  const handleEdit = () => {
    if (isEditable) {
      // Cancel edit
      setIsEditable(false)
      setEditedHashValue({})
      setDeletedHashFields(new Set())
    } else {
      // Start editing
      const initialHashValue: { [key: string]: string } = {}
      selectedKeyInfo.elements.forEach((element: ElementInfo) => {
        initialHashValue[element.key] = element.value
      })
      setEditedHashValue(initialHashValue)
      setDeletedHashFields(new Set())
      setIsEditable(true)
    }
  }

  const handleSave = () => {
    dispatch(updateKeyRequested({
      connectionId: connectionId,
      key: selectedKey,
      keyType: "hash",
      fields: Object.entries(editedHashValue)
        .filter(([field]) => !deletedHashFields.has(field))
        .map(([field, value]) => ({
          field,
          value,
        })),
      deletedHashFields: Array.from(deletedHashFields),
    }))
    setIsEditable(false)
    setEditedHashValue({})
    setDeletedHashFields(new Set())
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

  return (
    <div className="flex items-center justify-center w-full p-4">
      <table className="table-auto w-full overflow-visible">
        <thead className="bg-tw-dark-border opacity-85 text-white">
          <tr>
            <th className="w-1/2 py-3 px-4 text-left font-semibold">
              Key
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
            .filter((element: ElementInfo) => !deletedHashFields.has(element.key))
            .map((element: ElementInfo, index: number) => (
              <tr key={index}>
                <td className="py-3 px-4 border-b border-tw-dark-border font-light dark:text-white">
                  {element.key}
                </td>
                <td className="py-3 px-4 border-b border-tw-dark-border font-light dark:text-white">
                  {isEditable ? (
                    <div className="flex gap-2">
                      <input
                        className="w-full p-2 dark:bg-tw-dark-bg dark:border-tw-dark-border border rounded focus:outline-none
                                          focus:ring-2 focus:ring-blue-500"
                        onChange={(e) => handleHashFieldChange(element.key, e.target.value)}
                        type="text"
                        value={editedHashValue[element.key] || ""}
                      />
                      <div className="relative">
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
                    </div>
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
