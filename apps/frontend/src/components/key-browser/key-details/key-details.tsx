import { Key, Trash, X } from "lucide-react"
import { useState } from "react"
import { convertTTL } from "@common/src/ttl-conversion"
import { formatBytes } from "@common/src/bytes-conversion"
import { Button } from "../../ui/button"
import { Panel } from "../../ui/panel"
import { InfoChip } from "../../ui/info-chip"
import DeleteModal from "../../ui/delete-modal"
import KeyDetailsString from "./key-details-string"
import KeyDetailsHash from "./key-details-hash"
import KeyDetailsList from "./key-details-list"
import KeyDetailsSet from "./key-details-set"
import KeyDetailsZSet from "./key-details-zset"
import KeyDetailsStream from "./key-details-stream"
import KeyDetailsJson from "./key-details-json"
import { useAppDispatch } from "@/hooks/hooks"
import { deleteKeyRequested } from "@/state/valkey-features/keys/keyBrowserSlice"
import { CustomTooltip } from "@/components/ui/tooltip"

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

interface ZSetElement {
  key: string;
  value: number;
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
  })
  | (BaseKeyInfo & {
    type: "zset";
    elements: ZSetElement[];
  })
  | (BaseKeyInfo & {
    type: "stream";
    elements: Array<{
      key: string;
      value: [string, string][];
    }>;
  })
  | (BaseKeyInfo & {
    type: "ReJSON-RL";
    elements: string;
  });

interface keyDetailsProps {
  selectedKey: string | null;
  setSelectedKey: (key: string | null) => void;
  selectedKeyInfo: KeyInfo | null;
  connectionId: string;
  readOnly: boolean;
}

export default function KeyDetails({ selectedKey, selectedKeyInfo, connectionId, setSelectedKey, readOnly = false }: keyDetailsProps) {
  const dispatch = useAppDispatch()
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)

  const handleDeleteModal = () => {
    setIsDeleteModalOpen(!isDeleteModalOpen)
  }

  const handleKeyDelete = (keyName: string) => {
    dispatch(deleteKeyRequested({ connectionId: connectionId!, key: keyName }))
    setSelectedKey(null)
    handleDeleteModal()
  }

  return (
    <div className="pl-2 h-full">
      <Panel className="dark:border-tw-dark-border">
        {selectedKey && selectedKeyInfo ? (
          <div className="h-full p-4 text-sm font-light overflow-y-auto">
            {/* Header Section */}
            <div className="flex justify-between items-center mb-2 border-b pb-4 border-tw-dark-border">
              <span className="font-semibold flex items-center gap-2">
                <Key size={16} />
                {selectedKey}
              </span>
              <div className="space-x-2 flex items-center relative">

                {!readOnly && (
                  <InfoChip tooltip="TTL">
                    {convertTTL(selectedKeyInfo.ttl)}
                  </InfoChip>
                )}
                <InfoChip showBorder={!readOnly} tooltip="Type">
                  {selectedKeyInfo.type === "ReJSON-RL" ? "json" : selectedKeyInfo.type}
                </InfoChip>
                {!readOnly && (
                  <InfoChip tooltip="Size">
                    {formatBytes(selectedKeyInfo.size)}
                  </InfoChip>
                )}

                {selectedKeyInfo.collectionSize !== undefined && (
                  <InfoChip showBorder={!readOnly} tooltip="Collection size">
                    {selectedKeyInfo.collectionSize.toLocaleString()}
                  </InfoChip>
                )}
                {readOnly && (
                  <button
                    className="text-tw-primary hover:text-tw-primary/60 border-2 border-tw-primary rounded-full transition-colors"
                    onClick={() => setSelectedKey(null)}
                  >
                    <X size={18} />
                  </button>
                )}
                
                {!readOnly && (
                  <CustomTooltip content="Delete">
                    <Button
                      className="mr-0.5"
                      onClick={handleDeleteModal}
                      variant={"destructiveGhost"}
                    >
                      <Trash />
                    </Button>
                  </CustomTooltip>
                )}
                {/* Delete Modal */}
                {isDeleteModalOpen && (
                  <DeleteModal
                    itemName={selectedKeyInfo.name}
                    onCancel={handleDeleteModal}
                    onConfirm={() => handleKeyDelete(selectedKeyInfo.name)}
                  />
                )}
              </div>
            </div>

            {/* show different key types */}
            {selectedKeyInfo.type === "string" && (
              <KeyDetailsString
                connectionId={connectionId}
                readOnly={readOnly}
                selectedKey={selectedKey}
                selectedKeyInfo={selectedKeyInfo}
              />
            )}

            {selectedKeyInfo.type === "hash" && (
              <KeyDetailsHash
                connectionId={connectionId}
                readOnly={readOnly}
                selectedKey={selectedKey}
                selectedKeyInfo={selectedKeyInfo}
              />
            )}

            {selectedKeyInfo.type === "list" && (
              <KeyDetailsList
                connectionId={connectionId}
                readOnly={readOnly}
                selectedKey={selectedKey}
                selectedKeyInfo={selectedKeyInfo}
              />
            )}

            {selectedKeyInfo.type === "set" && (
              <KeyDetailsSet
                connectionId={connectionId}
                readOnly={readOnly}
                selectedKey={selectedKey}
                selectedKeyInfo={selectedKeyInfo}
              />
            )}

            {selectedKeyInfo.type === "zset" && (
              <KeyDetailsZSet
                connectionId={connectionId}
                readOnly={readOnly}
                selectedKey={selectedKey}
                selectedKeyInfo={selectedKeyInfo}
              />
            )}

            {selectedKeyInfo.type === "stream" && (
              <KeyDetailsStream
                connectionId={connectionId}
                readOnly={readOnly}
                selectedKey={selectedKey}
                selectedKeyInfo={selectedKeyInfo}
              />
            )}

            {selectedKeyInfo.type === "ReJSON-RL" && (
              <KeyDetailsJson
                connectionId={connectionId}
                readOnly={readOnly}
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
      </Panel>
    </div>
  )
}
