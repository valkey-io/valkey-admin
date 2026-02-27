import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md px-3 py-1 text-sm font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "border border-primary bg-primary/5",
        secondary:
          "border border-border text-foreground bg-secondary",
        success:
          "border border-green-500 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-500/10",
        warning:
          "border border-yellow-500 text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-500/10",
        destructive:
          "border border-destructive text-destructive bg-destructive/10",
        outline:
          "border border-border text-foreground bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

interface BadgeProps
  extends React.ComponentProps<"div">,
  VariantProps<typeof badgeVariants> {
  icon?: React.ReactNode
}

function Badge({ className, variant, icon, children, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant }), className)}
      data-slot="badge"
      {...props}
    >
      {icon}
      {children}
    </div>
  )
}

export { Badge }
