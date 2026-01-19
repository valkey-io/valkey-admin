import { useState } from "react"
import { Check, Pencil, X } from "lucide-react"
import { CustomTooltip } from "./custom-tooltip"
import { Button } from "./button"
import { useAppDispatch } from "@/hooks/hooks"
import { updateKeyRequested } from "@/state/valkey-features/keys/keyBrowserSlice"

interface ZSetElement {
  key: string;
  value: number;
}

interface KeyDetailsZSetProps {
  selectedKey: string;
  selectedKeyInfo: {
    name: string;
    type: "zset";
    ttl: number;
    size: number;
    collectionSize?: number;
    elements: ZSetElement[];
  };
  connectionId: string;
  readOnly: boolean;
}

export default function KeyDetailsZSet(
  { selectedKey, selectedKeyInfo, connectionId, readOnly = false }: KeyDetailsZSetProps,
) {
  const dispatch = useAppDispatch()
  const [isEditable, setIsEditable] = useState(false)
  const [editedValues, setEditedValues] = useState<number[]>([])

  console.log("selectedKeyInfo:::", selectedKeyInfo)

  const handleEdit = () => {
    if (isEditable) {
      // Cancel edit
      setIsEditable(false)
      setEditedValues([])
    } else {
      // Start editing - initialize with current values
      setEditedValues(selectedKeyInfo.elements.map((el) => el.value))
      setIsEditable(true)
    }
  }

  const handleSave = () => {
    // Create zsetUpdates array with key and value pairs for changed scores
    const zsetUpdates = editedValues
      .map((newScore, index) => ({
        member: selectedKeyInfo.elements[index].key,
        score: newScore,
      }))
      .filter((update, index) => update.score !== selectedKeyInfo.elements[index].value)

    dispatch(updateKeyRequested({
      connectionId: connectionId,
      key: selectedKey,
      keyType: "zset",
      zsetUpdates,
    }))
    setIsEditable(false)
    setEditedValues([])
  }

  const handleValueChange = (index: number, newValue: string) => {
    setEditedValues((prev) => {
      const updatedValues = [...prev]
      updatedValues[index] = parseFloat(newValue) || 0
      return updatedValues
    })
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
                <CustomTooltip content="Cancel" side={"top"}>
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
        {selectedKeyInfo.elements.map((element: ZSetElement, index: number) => (
          <div className="grid grid-cols-4 gap-4 py-3 px-4 border-b border-tw-dark-border font-light dark:text-white" key={index}>
            <div>{element.key}</div>
            <div className="col-span-3">
              {isEditable ? (
                <input
                  className="w-full p-2 dark:bg-tw-dark-bg dark:border-tw-dark-border border rounded focus:outline-none
                                    focus:ring-2 focus:ring-tw-primary"
                  onChange={(e) => handleValueChange(index, e.target.value)}
                  step="any"
                  type="number"
                  value={editedValues[index] !== undefined ? editedValues[index] : element.value}
                />
              ) : (
                element.value
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
