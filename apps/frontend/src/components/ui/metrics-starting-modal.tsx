import * as Dialog from "@radix-ui/react-dialog"
import { Loader2 } from "lucide-react"
import { Typography } from "./typography"

interface MetricsStartingModalProps {
  open: boolean
  title?: string
  message?: string
}

export function MetricsStartingModal({
  open,
  title = "Metrics server is starting",
  message = "Setting up metrics for this connection. Please wait...",
}: MetricsStartingModalProps) {
  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2
           bg-white dark:bg-tw-dark-primary p-6 rounded"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="animate-spin text-primary" size={32} />
            <Dialog.Title asChild>
              <Typography variant="bodySm">{title}</Typography>
            </Dialog.Title>
            <Dialog.Description asChild>
              <Typography variant="bodyXs">
                {message}
              </Typography>
            </Dialog.Description>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
