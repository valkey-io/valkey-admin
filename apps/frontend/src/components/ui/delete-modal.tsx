import { Trash, X } from "lucide-react"
import { Button } from "./button"

interface DeleteModalProps {
  keyName: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export default function DeleteModal({
  keyName,
  onConfirm,
  onCancel,
}: DeleteModalProps) {
  return (
    <div className="flex flex-col items-start gap-1 h-24 w-60 bg-white dark:bg-tw-dark-primary 
    border border-tw-dark-border rounded p-2 text-sm font-thin shadow-xl absolute top-74 right-12 z-20">
      <div className="flex flex-row justify-between w-full">
        <span>You are deleting:</span>
        <X className="hover:text-tw-primary" onClick={onCancel} size={16} />
      </div>
      <span className="font-semibold">{keyName}</span>
      <Button onClick={onConfirm} variant={"destructiveGhost"}>
        <Trash size={12} /> Delete
      </Button>
    </div>
  )
}
