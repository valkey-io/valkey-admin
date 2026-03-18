import { type ReactNode } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { Button } from "./button"
import { Typography } from "./typography"

interface ChartModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  action?: ReactNode
}

export function ChartModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  action,
}: ChartModalProps) {
  return (
    <Dialog.Root onOpenChange={onClose} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-black/50" />
        <Dialog.Content asChild>
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
            <div className="w-full max-w-4xl p-6 bg-white dark:bg-tw-dark-primary rounded-md">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <Dialog.Title asChild>
                    <Typography variant="subheading">{title}</Typography>
                  </Dialog.Title>
                  {subtitle && (
                    <Dialog.Description asChild>
                      <Typography className="mt-1" variant="bodySm">
                        {subtitle}
                      </Typography>
                    </Dialog.Description>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {action && <div>{action}</div>}
                  <Dialog.Close asChild>
                    <Button className="hover:text-primary p-0" variant="ghost">
                      <X size={20} />
                    </Button>
                  </Dialog.Close>
                </div>
              </div>
              <div className="mt-8">{children}</div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
