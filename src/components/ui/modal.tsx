import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../utils/cn";

const ModalRoot = DialogPrimitive.Root;
const ModalTrigger = DialogPrimitive.Trigger;
const ModalClose = DialogPrimitive.Close;
const ModalPortal = DialogPrimitive.Portal;

const ModalOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...rest }, forwardedRef) => {
  return (
    <DialogPrimitive.Overlay
      ref={forwardedRef}
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      {...rest}
    />
  );
});
ModalOverlay.displayName = "ModalOverlay";

const ModalContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    overlayClassName?: string;
    showClose?: boolean;
  }
>(
  (
    { className, overlayClassName, children, showClose = true, ...rest },
    forwardedRef
  ) => {
    return (
      <ModalPortal>
        <ModalOverlay className={overlayClassName}>
          <DialogPrimitive.Content
            ref={forwardedRef}
            className={cn(
              "relative w-full max-w-[400px]",
              "rounded-2xl shadow-2xl",
              "focus:outline-none",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
              "bg-secondary border border-DEFAULT",
              className
            )}
            {...rest}
          >
            {children}
            {showClose && (
              <ModalClose
                className="absolute right-4 top-4 rounded-sm p-1 transition-colors text-tertiary hover:text-primary"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </ModalClose>
            )}
          </DialogPrimitive.Content>
        </ModalOverlay>
      </ModalPortal>
    );
  }
);
ModalContent.displayName = "ModalContent";

const ModalTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...rest }, forwardedRef) => {
  return (
    <DialogPrimitive.Title
      ref={forwardedRef}
      className={cn("text-sm font-medium text-primary", className)}
      {...rest}
    />
  );
});
ModalTitle.displayName = "ModalTitle";

const ModalDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...rest }, forwardedRef) => {
  return (
    <DialogPrimitive.Description
      ref={forwardedRef}
      className={cn("text-xs text-secondary", className)}
      {...rest}
    />
  );
});
ModalDescription.displayName = "ModalDescription";

export {
  ModalRoot as Root,
  ModalTrigger as Trigger,
  ModalClose as Close,
  ModalPortal as Portal,
  ModalOverlay as Overlay,
  ModalContent as Content,
  ModalTitle as Title,
  ModalDescription as Description,
};
