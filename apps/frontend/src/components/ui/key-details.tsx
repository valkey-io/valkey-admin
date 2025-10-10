import { Check, Key, Pencil, Trash, X } from "lucide-react"
import { useState } from "react"
import { convertTTL } from "@common/src/ttl-conversion"
import { formatBytes } from "@common/src/bytes-conversion"
import { CustomTooltip } from "./custom-tooltip"
import { Button } from "./button"
import DeleteModal from "./delete-modal"
import { deleteKeyRequested, updateKeyRequested } from "@/state/valkey-features/keys/keyBrowserSlice"
import { useAppDispatch } from "@/hooks/hooks"

interface KeyInfo {
  name: string;
  type: string;
  ttl: number;
  size: number;
  collectionSize?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elements?: any;
}

interface ElementInfo {
  key: string;
  value: string;
}

interface keyDetailsProps {
  selectedKey: string | null;
  setSelectedKey: (key: string | null) => void;
  selectedKeyInfo: KeyInfo | null;
  conectionId: string;
}

export default function KeyDetails({ selectedKey, selectedKeyInfo, conectionId, setSelectedKey }: keyDetailsProps) {
  const dispatch = useAppDispatch()
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isEditable, setIsEditable] = useState(false)
  const [editedValue, setEditedValue] = useState("")
  const [editedHashValue, setEditedHashValue] = useState<{ [key: string]: string }>({})
  const [editedListValues, setEditedListValues] = useState<string[]>([])
  const [editedSetValues, setEditedSetValues] = useState<string[]>([])

  const handleDeleteModal = () => {
    setIsDeleteModalOpen(!isDeleteModalOpen)
  }

  const handleKeyDelete = (keyName: string) => {
    dispatch(deleteKeyRequested({ connectionId: conectionId!, key: keyName }))
    setSelectedKey(null)
    handleDeleteModal()
  }

  const handleEdit = () => {
    if (isEditable) {
      // Cancel edit
      setIsEditable(false)
      setEditedValue("")
      setEditedHashValue({})
      setEditedListValues([])
      setEditedSetValues([])
    } else {
      // Start editing
      if (selectedKeyInfo?.type === "string") {
        setEditedValue(selectedKeyInfo.elements)
      } else if (selectedKeyInfo?.type === "hash") {
        const initialHashValue: { [key: string]: string } = {}
        selectedKeyInfo.elements.forEach((element: ElementInfo) => {
          initialHashValue[element.key] = element.value
        })
        setEditedHashValue(initialHashValue)
      } else if (selectedKeyInfo?.type === "list" && Array.isArray(selectedKeyInfo.elements)) {
        setEditedListValues([...selectedKeyInfo.elements])
      } else if (selectedKeyInfo?.type === "set" && Array.isArray(selectedKeyInfo.elements)) {
        setEditedSetValues([...selectedKeyInfo.elements])
      }
      setIsEditable(true)
    }
  }

  const handleSave = () => {
    if (selectedKey && conectionId && selectedKeyInfo) {
      if (selectedKeyInfo.type === "string") {
        dispatch(updateKeyRequested({
          connectionId: conectionId,
          key: selectedKey,
          keyType: "string",
          value: editedValue,
        }))
      } else if (selectedKeyInfo.type === "hash") {
        dispatch(updateKeyRequested({
          connectionId: conectionId,
          key: selectedKey,
          keyType: "hash",
          fields: Object.entries(editedHashValue).map(([field, value]) => ({
            field,
            value,
          })),
        }))
      } else if (selectedKeyInfo.type === "list") {
        // creating listUpdates array with only changed values
        const listUpdates = editedListValues
          .map((value, index) => ({
            index,
            value,
          }))
          .filter((update, index) => update.value !== selectedKeyInfo.elements[index])

        dispatch(updateKeyRequested({
          connectionId: conectionId,
          key: selectedKey,
          keyType: "list",
          listUpdates,
        }))
      } else if (selectedKeyInfo.type === "set") {
        // creating setUpdates array with oldValue and newValue pairs
        const setUpdates = editedSetValues
          .map((newValue, index) => ({
            oldValue: selectedKeyInfo.elements[index],
            newValue,
          }))
          .filter((update) => update.oldValue !== update.newValue)

        dispatch(updateKeyRequested({
          connectionId: conectionId,
          key: selectedKey,
          keyType: "set",
          setUpdates,
        }))
      }
      setIsEditable(false)
      setEditedValue("")
      setEditedHashValue({})
      setEditedListValues([])
      setEditedSetValues([])
    }
  }

  const handleHashFieldChange = (fieldKey: string, newValue: string) => {
    setEditedHashValue((prev) => ({
      ...prev,
      [fieldKey]: newValue,
    }))
  }

  const handleListFieldChange = (index: number, newValue: string) => {
    setEditedListValues((prev) => {
      const updatedList = [...prev]
      updatedList[index] = newValue
      return updatedList
    })
  }

  const handleSetFieldChange = (index: number, newValue: string) => {
    setEditedSetValues((prev) => {
      const updatedSet = [...prev]
      updatedSet[index] = newValue
      return updatedSet
    })
  }

  return (
    <div className="w-1/2 pl-2">
      <div className="h-full dark:border-tw-dark-border border rounded overflow-hidden">
        {selectedKey && selectedKeyInfo ? (
          <div className="h-full p-4 text-sm font-light overflow-y-auto">
            <div className="flex justify-between items-center mb-2 border-b pb-4 border-tw-dark-border">
              <span className="font-semibold flex items-center gap-2">
                <Key size={16} />
                {selectedKey}
              </span>
              <div className="space-x-2 flex items-center relative">
                <CustomTooltip content="TTL">
                  <span className="text-xs px-2 py-1 rounded-full border-2 border-tw-primary text-tw-primary dark:text-white">
                    {convertTTL(selectedKeyInfo.ttl)}
                  </span>
                </CustomTooltip>
                <CustomTooltip content="Type">
                  <span className="text-xs px-2 py-1 rounded-full border-2 border-tw-primary text-tw-primary dark:text-white">
                    {selectedKeyInfo.type}
                  </span>
                </CustomTooltip>
                <CustomTooltip content="Size">
                  <span className="text-xs px-2 py-1 rounded-full border-2 border-tw-primary text-tw-primary dark:text-white">
                    {formatBytes(selectedKeyInfo.size)}
                  </span>
                </CustomTooltip>
                {selectedKeyInfo.collectionSize !== undefined && (
                  <CustomTooltip content="Collection size">
                    <span className="text-xs px-2 py-1 rounded-full border-2 border-tw-primary text-tw-primary dark:text-white">
                      {selectedKeyInfo.collectionSize.toLocaleString()}
                    </span>
                  </CustomTooltip>
                )}
                <CustomTooltip content="Delete">
                  <Button
                    className="mr-0.5"
                    onClick={handleDeleteModal}
                    variant={"destructiveGhost"}
                  >
                    <Trash />
                  </Button>
                </CustomTooltip>
              </div>
            </div>
            {isDeleteModalOpen && (
              <DeleteModal
                keyName={selectedKeyInfo.name}
                onCancel={handleDeleteModal}
                onConfirm={() => handleKeyDelete(selectedKeyInfo.name)}
              />
            )}
            {/* Key Elements */}
            <div className="flex items-center justify-center w-full p-4">
              <table className="table-auto w-full overflow-hidden">
                <thead className="bg-tw-dark-border opacity-85 text-white">
                  <tr>
                    <th className="w-1/2 py-3 px-4 text-left font-semibold">
                      {selectedKeyInfo.type === "list"
                        ? "Index"
                        : selectedKeyInfo.type === "string" ? "Value" : "Key"}
                    </th>
                    <th className="w-1/2 py-3 px-4 text-left font-semibold">
                      {selectedKeyInfo.type === "list"
                        ? "Elements" : selectedKeyInfo.type === "string" ? ""
                          : "Value"}
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
                  {selectedKeyInfo.type === "string" ? (
                    <tr>
                      <td className="py-3 px-4 font-light dark:text-white" colSpan={2}>
                        {isEditable ? (
                          <textarea
                            autoFocus
                            className="w-full p-2 dark:bg-tw-dark-bg dark:border-tw-dark-border border rounded focus:outline-none 
            focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                            onChange={(e) => setEditedValue(e.target.value)}
                            value={editedValue}
                          />
                        ) : (
                          <div className="whitespace-pre-wrap break-words">
                            {selectedKeyInfo.elements}
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (
                    selectedKeyInfo.elements.map(
                      (element: ElementInfo, index: number) => (
                        <tr key={index}>
                          <td className="py-3 px-4 border-b border-tw-dark-border font-light dark:text-white">
                            {selectedKeyInfo.type === "list" || selectedKeyInfo.type === "set"
                              ? index
                              : element.key}
                          </td>
                          <td className="py-3 px-4 border-b border-tw-dark-border font-light dark:text-white">
                            {isEditable && selectedKeyInfo.type === "hash" ? (
                              <input
                                className="w-full p-2 dark:bg-tw-dark-bg dark:border-tw-dark-border border rounded focus:outline-none 
                focus:ring-2 focus:ring-blue-500"
                                onChange={(e) => handleHashFieldChange(element.key, e.target.value)}
                                type="text"
                                value={editedHashValue[element.key] || ""}
                              />
                            ) : isEditable && selectedKeyInfo.type === "list" ? (
                              <input
                                className="w-full p-2 dark:bg-tw-dark-bg dark:border-tw-dark-border border rounded focus:outline-none 
                focus:ring-2 focus:ring-blue-500"
                                onChange={(e) => handleListFieldChange(index, e.target.value)}
                                type="text"
                                value={editedListValues[index] || ""}
                              />
                            ) : isEditable && selectedKeyInfo.type === "set" ? (
                              <input
                                className="w-full p-2 dark:bg-tw-dark-bg dark:border-tw-dark-border border rounded focus:outline-none 
                                focus:ring-2 focus:ring-blue-500"
                                onChange={(e) => handleSetFieldChange(index, e.target.value)}
                                type="text"
                                value={editedSetValues[index] || ""}
                              />
                            ) : (
                              selectedKeyInfo.type === "list" || selectedKeyInfo.type === "set"
                                ? String(element)
                                : element.value
                            )}
                          </td>
                          <td className="py-3 px-4 border-b border-tw-dark-border font-light dark:text-white"></td>
                        </tr>
                      ),
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="h-full p-4 text-sm font-light flex items-center justify-center text-gray-500">
            Select a key to see details
          </div>
        )}
      </div>
    </div>
  )
}
