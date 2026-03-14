import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-sm transition-colors " +
    "[&>svg]:absolute [&>svg]:left-4 [&>svg]:top-3 [&>svg]:text-foreground [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        default:
          "bg-background text-foreground border-border",
        destructive:
          "border-destructive text-destructive bg-destructive/10",
        success:
          "border-green-500 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-500/10",
        warning:
          "border-yellow-500 text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-500/10",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

interface AlertProps
  extends React.ComponentProps<"div">,
  VariantProps<typeof alertVariants> {}

function Alert({ className, variant, ...props }: AlertProps) {
  return (
    <div
      className={cn(alertVariants({ variant }), className)}
      data-slot="alert"
      role="alert"
      {...props}
    />
  )
}

type AlertTitleProps = React.HTMLAttributes<HTMLHeadingElement>

function AlertTitle({ className, ...props }: AlertTitleProps) {
  return (
    <h5
      className={cn("mb-1 font-medium leading-none tracking-tight", className)}
      data-slot="alert-title"
      {...props}
    />
  )
}

type AlertDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>

function AlertDescription({ className, ...props }: AlertDescriptionProps) {
  return (
    <div
      className={cn("text-sm [&_p]:leading-relaxed", className)}
      data-slot="alert-description"
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
