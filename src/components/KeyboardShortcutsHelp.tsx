import {
  SHORTCUT_DEFINITIONS,
  SHORTCUT_GROUPS,
  formatShortcut,
  formatShortcutKeys,
  getShortcutsForAction,
} from "../lib/keyboard-shortcuts";
import { useAppStore } from "../store";
import { cn } from "../utils/cn";
import * as Modal from "./ui/modal";

export function ShortcutKeys({
  shortcut,
  muted = false,
}: {
  shortcut: string;
  muted?: boolean;
}) {
  return (
    <kbd role="img" aria-label={formatShortcut(shortcut)} className="flex items-center gap-0.5 font-sans">
      {formatShortcutKeys(shortcut).map((key, index) => (
        <span
          key={`${key}-${index}`}
          aria-hidden="true"
          className={cn(
            "flex h-[22px] min-w-[22px] items-center justify-center rounded-[5px] border px-1.5 text-[12px] leading-none",
            muted
              ? "border-border-subtle text-tertiary"
              : "border-border bg-secondary text-primary shadow-[0_1px_0_var(--color-border-default)]",
          )}
        >
          {key}
        </span>
      ))}
    </kbd>
  );
}

export function KeyboardShortcutsHelp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const shortcuts = useAppStore((state) => state.keyboardShortcuts);
  const definitions = new Map(
    SHORTCUT_DEFINITIONS.map((definition) => [definition.id, definition]),
  );

  return (
    <Modal.Root open={open} onOpenChange={onOpenChange}>
      <Modal.Content className="max-h-[85vh] max-w-[760px] overflow-hidden p-0">
        <div className="px-5 pb-3 pt-4 pr-12">
          <Modal.Title>Keyboard shortcuts</Modal.Title>
          <Modal.Description className="mt-1 text-tertiary">
            Brackets work on a 60% keyboard; the faded keys are arrow-key alternatives.
          </Modal.Description>
        </div>

        <div className="max-h-[calc(85vh-72px)] overflow-y-auto px-5 pb-5">
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {SHORTCUT_GROUPS.map((group) => (
              <section
                key={group.title}
                aria-label={group.title}
                className={cn(group.actions.length > 5 && "sm:row-span-2")}
              >
                <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-tertiary">
                  {group.title}
                </h3>
                <ul>
                  {group.actions.map((action) => {
                    const definition = definitions.get(action);
                    if (!definition) return null;
                    const [primary, ...alternates] = getShortcutsForAction(action, shortcuts);
                    return (
                      <li
                        key={action}
                        title={definition.description}
                        className="flex h-9 items-center justify-between gap-3 border-b border-border-subtle last:border-b-0"
                      >
                        <span className="truncate text-[13px] text-secondary">
                          {definition.label}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {alternates.map((binding) => (
                            <ShortcutKeys key={binding} shortcut={binding} muted />
                          ))}
                          <ShortcutKeys shortcut={primary} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </Modal.Content>
    </Modal.Root>
  );
}
