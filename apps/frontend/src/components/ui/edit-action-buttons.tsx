import { Check, Pencil, X } from "lucide-react"
import { CustomTooltip } from "./tooltip"
import { Button } from "./button"

interface EditActionButtonsProps {
  isEditable: boolean
  readOnly: boolean
  onSave: () => void
  onEdit: () => void
  disabled?: boolean
  disabledTooltip?: string
}

export function EditActionButtons({
  isEditable,
  readOnly,
  onSave,
  onEdit,
  disabled = false,
  disabledTooltip,
}: EditActionButtonsProps) {
  if (readOnly) return null

  if (isEditable) {
    return (
      <div className="flex gap-1">
        <CustomTooltip content="Save">
          <Button
            className="text-tw-primary hover:text-tw-primary"
            onClick={onSave}
            variant="secondary"
          >
            <Check />
          </Button>
        </CustomTooltip>
        <CustomTooltip content="Cancel">
          <Button onClick={onEdit} variant="destructiveGhost">
            <X />
          </Button>
        </CustomTooltip>
      </div>
    )
  }

  return (
    <CustomTooltip content={disabled && disabledTooltip ? disabledTooltip : "Edit"}>
      <Button
        className="mr-1"
        disabled={disabled}
        onClick={onEdit}
        variant="ghost"
      >
        <Pencil />
      </Button>
    </CustomTooltip>
  )
}
