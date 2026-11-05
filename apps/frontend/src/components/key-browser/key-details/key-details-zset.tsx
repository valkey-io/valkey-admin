import { useState } from "react"
import { Input } from "../../ui/input"
import { EditActionButtons } from "../../ui/edit-action-buttons"
import { Typography } from "../../ui/typography"
import { CustomTooltip } from "../../ui/tooltip"
import { Badge } from "../../ui/badge"
import { useAppDispatch } from "@/hooks/hooks"
import { updateKeyRequested } from "@/state/valkey-features/keys/keyBrowserSlice"
import { cn } from "@/lib/utils"

interface ZSetElement {
  key: string;
  value: number;
  isKeyBinary?: boolean;
  isBinary?: boolean;
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

  console.debug("selectedKeyInfo:::", selectedKeyInfo)

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
        isBinary: selectedKeyInfo.elements[index].isKeyBinary || selectedKeyInfo.elements[index].isBinary,
      }))
      .filter((update, index) => !update.isBinary && update.score !== selectedKeyInfo.elements[index].value)
      .map(({ member, score }) => ({ member, score }))

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
        {selectedKeyInfo.elements.map((element: ZSetElement, index: number) => {
          const isBinary = element.isKeyBinary || element.isBinary
          return (
            <div className={cn("grid grid-cols-4 gap-4 py-3 px-4 border-b border-border text-foreground")} key={index}>
              <div className="flex items-center gap-1.5 overflow-hidden">
                <Typography className="truncate" variant="code">{element.key}</Typography>
                {isBinary && (
                  <CustomTooltip content="Binary member name">
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
                      <CustomTooltip content="Scores for binary members can't be edited">
                        <Badge className="text-[10px] px-1 py-0" variant="secondary">binary</Badge>
                      </CustomTooltip>
                    </div>
                  ) : (
                    <Input
                      aria-label="Edit zset value"
                      onChange={(e) => handleValueChange(index, e.target.value)}
                      step="any"
                      type="number"
                      value={editedValues[index] !== undefined ? editedValues[index] : element.value}
                    />
                  )
                ) : (
                  <Typography variant="code">{element.value}</Typography>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
