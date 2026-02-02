import * as React from "react";
import { type DialogProps } from "@radix-ui/react-dialog";
import { Command } from "cmdk";

import * as Modal from "./modal";
import { cn } from "../../utils/cn";
import { PolymorphicComponentProps } from "../../utils/polymorphic";

const CommandDialogTitle = Modal.Title;
const CommandDialogDescription = Modal.Description;

const CommandDialog = ({
  children,
  className,
  overlayClassName,
  ...rest
}: DialogProps & {
  className?: string;
  overlayClassName?: string;
}) => {
  return (
    <Modal.Root {...rest}>
      <Modal.Content
        overlayClassName={cn("justify-start pt-20", overlayClassName)}
        showClose={false}
        className={cn(
          "flex max-h-full max-w-[560px] flex-col overflow-hidden rounded-xl",
          className
        )}
      >
        <Command className="flex flex-col bg-secondary">
          {children}
        </Command>
      </Modal.Content>
    </Modal.Root>
  );
};

const CommandInput = React.forwardRef<
  React.ComponentRef<typeof Command.Input>,
  React.ComponentPropsWithoutRef<typeof Command.Input>
>(({ className, ...rest }, forwardedRef) => {
  return (
    <Command.Input
      ref={forwardedRef}
      className={cn(
        "w-full bg-transparent text-sm outline-none text-primary",
        "transition duration-200 ease-out",
        "placeholder:transition-colors placeholder:text-muted",
        "focus:outline-none",
        className
      )}
      {...rest}
    />
  );
});
CommandInput.displayName = "CommandInput";

const CommandList = React.forwardRef<
  React.ComponentRef<typeof Command.List>,
  React.ComponentPropsWithoutRef<typeof Command.List>
>(({ className, ...rest }, forwardedRef) => {
  return (
    <Command.List
      ref={forwardedRef}
      className={cn(
        "flex max-h-min min-h-0 flex-1 flex-col overflow-auto",
        className
      )}
      {...rest}
    />
  );
});
CommandList.displayName = "CommandList";

const CommandGroup = React.forwardRef<
  React.ComponentRef<typeof Command.Group>,
  React.ComponentPropsWithoutRef<typeof Command.Group>
>(({ className, ...rest }, forwardedRef) => {
  return (
    <Command.Group
      ref={forwardedRef}
      className={cn(
        "relative px-2 py-3",
        "[&>[cmdk-group-heading]]:text-xs [&>[cmdk-group-heading]]:font-medium",
        "[&>[cmdk-group-heading]]:mb-2 [&>[cmdk-group-heading]]:px-3 [&>[cmdk-group-heading]]:pt-1",
        "[&>[cmdk-group-heading]]:text-tertiary",
        className
      )}
      {...rest}
    />
  );
});
CommandGroup.displayName = "CommandGroup";

const CommandItem = React.forwardRef<
  React.ComponentRef<typeof Command.Item>,
  React.ComponentPropsWithoutRef<typeof Command.Item>
>(({ className, ...rest }, forwardedRef) => {
  return (
    <Command.Item
      ref={forwardedRef}
      className={cn(
        "flex items-center gap-3 rounded-lg",
        "cursor-pointer text-sm text-primary",
        "transition duration-200 ease-out",
        "px-3 py-2.5",
        "data-[selected=true]:bg-hover",
        className
      )}
      {...rest}
    />
  );
});
CommandItem.displayName = "CommandItem";

function CommandItemIcon<T extends React.ElementType>({
  className,
  as,
  ...rest
}: PolymorphicComponentProps<T>) {
  const Component = as || "div";

  return (
    <Component
      className={cn("size-4 shrink-0 text-tertiary", className)}
      {...rest}
    />
  );
}

function CommandFooter({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex h-12 items-center justify-between gap-3 px-5",
        className
      )}
      {...rest}
    />
  );
}

function CommandFooterKeyBox({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded bg-hover text-secondary",
        className
      )}
      {...rest}
    />
  );
}

export {
  CommandDialog as Dialog,
  CommandDialogTitle as DialogTitle,
  CommandDialogDescription as DialogDescription,
  CommandInput as Input,
  CommandList as List,
  CommandGroup as Group,
  CommandItem as Item,
  CommandItemIcon as ItemIcon,
  CommandFooter as Footer,
  CommandFooterKeyBox as FooterKeyBox,
};
