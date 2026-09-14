import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "../../utils/cn";

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipRoot = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, children, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 max-w-64 origin-[var(--radix-tooltip-content-transform-origin)] select-none rounded-md border border-border-strong bg-solid px-2 py-1 text-xs font-medium leading-4 text-primary shadow-lg",
        "animate-in fade-in-0 zoom-in-95 duration-150 ease-out motion-reduce:animate-none",
        className,
      )}
      {...props}
    >
      {children}
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

interface TooltipProps
  extends Omit<
    React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>,
    "content"
  > {
  children: React.ReactElement;
  content: React.ReactNode;
}

function Tooltip({ children, content, ...contentProps }: TooltipProps) {
  return (
    <TooltipRoot>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent {...contentProps}>{content}</TooltipContent>
    </TooltipRoot>
  );
}

export {
  TooltipProvider as Provider,
  TooltipRoot as Root,
  TooltipTrigger as Trigger,
  TooltipContent as Content,
  Tooltip,
};
