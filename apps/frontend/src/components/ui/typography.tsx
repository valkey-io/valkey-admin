import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const typographyVariants = cva("", {
  variants: {
    variant: {
      display: "text-display",
      title: "text-title",
      heading: "text-heading",
      subheading: "text-subheading",
      label: "text-label",
      body: "text-body",
      bodyLg: "text-body-lg",
      bodySm: "text-body-sm",
      bodyXs: "text-body-xs",
      caption: "text-caption",
      overline: "text-overline",
      code: "text-code",
      codeBlock: "text-code-block",
    },
  },
  defaultVariants: {
    variant: "body",
  },
})

type AllowedElements = "h1" | "h2" | "h3" | "h4" | "p" | "span" | "code" | "pre"

const defaultElements: Record<
  NonNullable<VariantProps<typeof typographyVariants>["variant"]>,
  AllowedElements
> = {
  display: "h1",
  title: "h2",
  heading: "h3",
  subheading: "h4",
  label: "p",
  body: "p",
  bodyLg: "p",
  bodySm: "p",
  bodyXs: "p",
  caption: "span",
  overline: "span",
  code: "code",
  codeBlock: "pre",
}

export interface TypographyProps
  extends React.HTMLAttributes<HTMLElement>,
  VariantProps<typeof typographyVariants> {
  asChild?: boolean
  as?: AllowedElements
}

function Typography({ className, variant = "body", asChild = false, as, ...props }: TypographyProps) {
  const Comp = asChild ? Slot : (as ?? defaultElements[variant ?? "body"])

  return (
    <Comp
      className={cn(typographyVariants({ variant }), className)}
      data-slot="typography"
      {...props}
    />
  )
}

export { Typography }
