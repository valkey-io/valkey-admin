import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const titleVariants = cva("font-bold flex items-center gap-2", {
  variants: {
    size: {
      sm: "text-lg",
      md: "text-xl",
      lg: "text-2xl",
      xl: "text-3xl",
    },
  },
  defaultVariants: {
    size: "md",
  },
})

interface TitleProps
  extends React.ComponentProps<"h1">,
  VariantProps<typeof titleVariants> {
  icon?: React.ReactNode
}

function Title({ className, size, icon, children, ...props }: TitleProps) {
  return (
    <h1
      className={cn(titleVariants({ size }), className)}
      data-slot="title"
      {...props}
    >
      {icon}
      {children}
    </h1>
  )
}

export { Title }
