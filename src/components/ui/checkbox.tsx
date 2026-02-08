"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check } from "lucide-react"

import { tv, type VariantProps } from "../../utils/tv"

const checkboxVariants = tv({
  slots: {
    root: [
      "peer shrink-0 rounded-[4px] border border-neutral-300 bg-transparent",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-1",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:bg-neutral-800 data-[state=checked]:border-neutral-800 data-[state=checked]:text-white",
      "dark:border-neutral-600",
      "dark:data-[state=checked]:bg-neutral-200 dark:data-[state=checked]:border-neutral-200 dark:data-[state=checked]:text-neutral-900",
      "dark:focus-visible:ring-neutral-500",
      "transition-colors",
    ],
    indicator: "flex items-center justify-center",
  },
  variants: {
    size: {
      sm: {
        root: "h-3.5 w-3.5",
        indicator: "[&>svg]:h-2.5 [&>svg]:w-2.5",
      },
      md: {
        root: "h-4 w-4",
        indicator: "[&>svg]:h-3 [&>svg]:w-3",
      },
    },
  },
  defaultVariants: {
    size: "md",
  },
})

export interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
    VariantProps<typeof checkboxVariants> {}

const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, size, ...props }, ref) => {
  const { root, indicator } = checkboxVariants({ size })

  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={root({ class: className })}
      {...props}
    >
      <CheckboxPrimitive.Indicator className={indicator()}>
        <Check strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
})
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox, checkboxVariants }
