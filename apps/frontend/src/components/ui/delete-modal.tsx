import { Trash, X } from "lucide-react"
import { Button } from "./button"

interface DeleteModalProps {
  itemName: string;
  message?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export default function DeleteModal({
  itemName,
  message = "You are deleting:",
  onConfirm,
  onCancel,
}: DeleteModalProps) {
  return (
    <div className="flex flex-col items-start gap-1 min-h-24 w-60 bg-white dark:bg-tw-dark-primary
    border border-tw-dark-border rounded p-2 text-sm font-thin shadow-xl absolute top-full mt-1 right-0 z-100">
      <div className="flex flex-row justify-between w-full">
        <span>{message}</span>
        <X className="hover:text-tw-primary cursor-pointer" onClick={onCancel} size={16} />
      </div>
      <span className="font-semibold break-words w-full">{itemName}</span>
      <Button onClick={onConfirm} variant={"destructiveGhost"}>
        <Trash size={12} /> Delete
      </Button>
    </div>
  )
}
