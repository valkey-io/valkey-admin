import * as Dialog from "@radix-ui/react-dialog"
import { AlertTriangle, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Typography } from "@/components/ui/typography"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface CommandConfirmDialogProps {
  command: string
  reason: string
  onConfirm: () => void
  onCancel: () => void
}

export function CommandConfirmDialog({ command, reason, onConfirm, onCancel }: CommandConfirmDialogProps) {
  const [typed, setTyped] = useState("")
  const confirmed = typed.trim().toUpperCase() === command.trim().toUpperCase()

  return (
    <Dialog.Root onOpenChange={(open) => !open && onCancel()} open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-black/50" />
        <Dialog.Content asChild>
          <div className="fixed inset-0 z-40 flex items-center justify-center">
            <div className="w-full max-w-md bg-white dark:bg-tw-dark-primary dark:border-tw-dark-border
            rounded-lg shadow-lg border p-4 flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <Dialog.Title asChild>
                  <Typography variant="subheading">Confirm Dangerous Command</Typography>
                </Dialog.Title>
                <Dialog.Close asChild>
                  <Button className="hover:text-primary h-auto" onClick={onCancel} variant="ghost">
                    <X size={20} />
                  </Button>
                </Dialog.Close>
              </div>

              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{reason}</AlertDescription>
              </Alert>

              <div className="flex flex-col gap-2">
                <Typography variant="bodySm">
                  Type <Typography variant="code">{command}</Typography> to confirm:
                </Typography>
                <Input
                  autoFocus
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmed && onConfirm()}
                  placeholder={command}
                  value={typed}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button onClick={onCancel} variant="outline">Cancel</Button>
                <Button disabled={!confirmed} onClick={onConfirm} variant="destructive">Run anyway</Button>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
