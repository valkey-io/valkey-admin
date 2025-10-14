import { Key, Trash } from "lucide-react"
import { useState } from "react"
import { convertTTL } from "@common/src/ttl-conversion"
import { formatBytes } from "@common/src/bytes-conversion"
import { CustomTooltip } from "./custom-tooltip"
import { Button } from "./button"
import DeleteModal from "./delete-modal"
import KeyDetailsString from "./key-details-string"
import KeyDetailsHash from "./key-details-hash"
import KeyDetailsList from "./key-details-list"
import KeyDetailsSet from "./key-details-set"
import { useAppDispatch } from "@/hooks/hooks"
import { deleteKeyRequested } from "@/state/valkey-features/keys/keyBrowserSlice"

interface BaseKeyInfo {
  name: string;
  ttl: number;
  size: number;
  collectionSize?: number;
}

interface ElementInfo {
  key: string;
  value: string;
}

type KeyInfo =
  | (BaseKeyInfo & {
    type: "string";
    elements: string;
  })
  | (BaseKeyInfo & {
    type: "hash";
    elements: ElementInfo[];
  })
  | (BaseKeyInfo & {
    type: "list";
    elements: string[];
  })
  | (BaseKeyInfo & {
    type: "set";
    elements: string[];
  });

interface keyDetailsProps {
  selectedKey: string | null;
  setSelectedKey: (key: string | null) => void;
  selectedKeyInfo: KeyInfo | null;
  conectionId: string;
}

export default function KeyDetails({ selectedKey, selectedKeyInfo, conectionId, setSelectedKey }: keyDetailsProps) {
  const dispatch = useAppDispatch()
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)

  const handleDeleteModal = () => {
    setIsDeleteModalOpen(!isDeleteModalOpen)
  }

  const handleKeyDelete = (keyName: string) => {
    dispatch(deleteKeyRequested({ connectionId: conectionId!, key: keyName }))
    setSelectedKey(null)
    handleDeleteModal()
  }

  return (
    <div className="w-1/2 pl-2">
      <div className="h-full dark:border-tw-dark-border border rounded overflow-hidden">
        {selectedKey && selectedKeyInfo ? (
          <div className="h-full p-4 text-sm font-light overflow-y-auto">
            {/* Header Section */}
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

            {/* Delete Modal */}
            {isDeleteModalOpen && (
              <DeleteModal
                keyName={selectedKeyInfo.name}
                onCancel={handleDeleteModal}
                onConfirm={() => handleKeyDelete(selectedKeyInfo.name)}
              />
            )}

            {/* show different key types */}
            {selectedKeyInfo.type === "string" && (
              <KeyDetailsString
                connectionId={conectionId}
                selectedKey={selectedKey}
                selectedKeyInfo={selectedKeyInfo}
              />
            )}

            {selectedKeyInfo.type === "hash" && (
              <KeyDetailsHash
                connectionId={conectionId}
                selectedKey={selectedKey}
                selectedKeyInfo={selectedKeyInfo}
              />
            )}

            {selectedKeyInfo.type === "list" && (
              <KeyDetailsList
                connectionId={conectionId}
                selectedKey={selectedKey}
                selectedKeyInfo={selectedKeyInfo}
              />
            )}

            {selectedKeyInfo.type === "set" && (
              <KeyDetailsSet
                connectionId={conectionId}
                selectedKey={selectedKey}
                selectedKeyInfo={selectedKeyInfo}
              />
            )}
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
