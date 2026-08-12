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
  filter,
  shouldFilter,
  ...rest
}: DialogProps & {
  className?: string;
  overlayClassName?: string;
  filter?: React.ComponentProps<typeof Command>["filter"];
  shouldFilter?: boolean;
}) => {
  return (
    <Modal.Root {...rest}>
      <Modal.Content
        overlayClassName={cn(
          "justify-start pt-20 motion-reduce:animate-none",
          overlayClassName,
        )}
        showClose={false}
        className={cn(
          "flex max-h-[calc(100dvh-4rem)] max-w-[580px] flex-col overflow-hidden rounded-lg shadow-2xl motion-reduce:animate-none",
          className
        )}
      >
        <Command className="flex flex-col bg-secondary" filter={filter} shouldFilter={shouldFilter}>
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
        "w-full bg-transparent text-sm text-primary outline-none",
        "placeholder:text-muted",
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

const CommandEmpty = React.forwardRef<
  React.ComponentRef<typeof Command.Empty>,
  React.ComponentPropsWithoutRef<typeof Command.Empty>
>(({ className, ...rest }, forwardedRef) => (
  <Command.Empty
    ref={forwardedRef}
    className={cn("px-4 py-10 text-center text-sm text-tertiary", className)}
    {...rest}
  />
));
CommandEmpty.displayName = "CommandEmpty";

const CommandGroup = React.forwardRef<
  React.ComponentRef<typeof Command.Group>,
  React.ComponentPropsWithoutRef<typeof Command.Group>
>(({ className, ...rest }, forwardedRef) => {
  return (
    <Command.Group
      ref={forwardedRef}
      className={cn(
        "relative border-t border-subtle px-1 py-1 first:border-t-0",
        "[&>[cmdk-group-heading]]:text-[10px] [&>[cmdk-group-heading]]:font-medium",
        "[&>[cmdk-group-heading]]:px-1.5 [&>[cmdk-group-heading]]:py-0.5",
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
        "flex items-center gap-2 rounded-md",
        "cursor-pointer text-sm text-primary",
        "px-1.5 py-1",
        "data-[selected=true]:bg-active",
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
        "flex h-8 items-center justify-between gap-2 px-2",
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
        "flex min-w-5 shrink-0 items-center justify-center rounded border border-subtle bg-hover px-1 py-0.5 font-sans text-[10px] leading-none text-secondary",
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
  CommandEmpty as Empty,
  CommandGroup as Group,
  CommandItem as Item,
  CommandItemIcon as ItemIcon,
  CommandFooter as Footer,
  CommandFooterKeyBox as FooterKeyBox,
};
