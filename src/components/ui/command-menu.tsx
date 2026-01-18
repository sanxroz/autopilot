import * as React from "react";
import { type DialogProps } from "@radix-ui/react-dialog";
import { Command } from "cmdk";

import * as Modal from "./modal";
import { cn } from "../../utils/cn";
import { PolymorphicComponentProps } from "../../utils/polymorphic";
import { useTheme } from "../../hooks/useTheme";

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
  const theme = useTheme();

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
        <Command
          className="flex flex-col"
          style={{
            background: theme.bg.secondary,
          }}
        >
          {children}
        </Command>
      </Modal.Content>
    </Modal.Root>
  );
};

const CommandInput = React.forwardRef<
  React.ComponentRef<typeof Command.Input>,
  React.ComponentPropsWithoutRef<typeof Command.Input>
>(({ className, style, ...rest }, forwardedRef) => {
  const theme = useTheme();

  return (
    <Command.Input
      ref={forwardedRef}
      className={cn(
        "w-full bg-transparent text-sm outline-none",
        "transition duration-200 ease-out",
        "placeholder:transition-colors",
        "focus:outline-none",
        className
      )}
      style={{
        color: theme.text.primary,
        ...style,
      }}
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
  const theme = useTheme();

  return (
    <Command.Group
      ref={forwardedRef}
      className={cn(
        "relative px-2 py-3",
        "[&>[cmdk-group-heading]]:text-xs [&>[cmdk-group-heading]]:font-medium",
        "[&>[cmdk-group-heading]]:mb-2 [&>[cmdk-group-heading]]:px-3 [&>[cmdk-group-heading]]:pt-1",
        "[&>[cmdk-group-heading]]:text-[var(--group-heading-color)]",
        className
      )}
      style={{
        ["--group-heading-color" as string]: theme.text.tertiary,
      }}
      {...rest}
    />
  );
});
CommandGroup.displayName = "CommandGroup";

const CommandItem = React.forwardRef<
  React.ComponentRef<typeof Command.Item>,
  React.ComponentPropsWithoutRef<typeof Command.Item>
>(({ className, style, ...rest }, forwardedRef) => {
  const theme = useTheme();

  return (
    <Command.Item
      ref={forwardedRef}
      className={cn(
        "flex items-center gap-3 rounded-lg",
        "cursor-pointer text-sm",
        "transition duration-200 ease-out",
        "px-3 py-2.5",
        "data-[selected=true]:bg-[var(--item-selected-bg)]",
        className
      )}
      style={{
        color: theme.text.primary,
        ["--item-selected-bg" as string]: theme.bg.hover,
        ["--item-active-bg" as string]: theme.bg.active,
        ...style,
      }}
      {...rest}
    />
  );
});
CommandItem.displayName = "CommandItem";

function CommandItemIcon<T extends React.ElementType>({
  className,
  as,
  style,
  ...rest
}: PolymorphicComponentProps<T> & { style?: React.CSSProperties }) {
  const Component = as || "div";
  const theme = useTheme();

  return (
    <Component
      className={cn("size-4 shrink-0", className)}
      style={{ color: theme.text.tertiary, ...style }}
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
  style,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  const theme = useTheme();

  return (
    <div
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded",
        className
      )}
      style={{
        background: theme.bg.hover,
        color: theme.text.secondary,
        ...style,
      }}
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
