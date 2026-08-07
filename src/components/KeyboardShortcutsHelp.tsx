import {
  SHORTCUT_DEFINITIONS,
  formatShortcut,
  getShortcutsForAction,
  type ShortcutAction,
} from "../lib/keyboard-shortcuts";
import { useAppStore } from "../store";
import * as Modal from "./ui/modal";

const SECTIONS: readonly {
  title: string;
  actions: readonly ShortcutAction[];
}[] = [
  {
    title: "Move around",
    actions: [
      "previousSpace",
      "nextSpace",
      "previousSession",
      "nextSession",
      "previousTerminal",
      "nextTerminal",
      "previousLayout",
      "nextLayout",
      "focusTerminal",
    ],
  },
  {
    title: "Panels and views",
    actions: [
      "toggleSidebar",
      "toggleWorkspacePanel",
      "showGit",
      "showNotes",
      "openWith",
    ],
  },
  {
    title: "Application",
    actions: ["commandMenu", "settings"],
  },
];

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
      <Modal.Content className="max-h-[80vh] max-w-[640px] overflow-hidden p-0">
        <div className="border-b border-border px-5 py-4 pr-12">
          <Modal.Title>Keyboard shortcuts</Modal.Title>
          <Modal.Description className="mt-1 leading-5">
            Use brackets on a 60% keyboard or the arrow alternatives on a full keyboard.
          </Modal.Description>
        </div>

        <div className="max-h-[calc(80vh-76px)] space-y-5 overflow-y-auto p-5">
          {SECTIONS.map((section) => (
            <section key={section.title} aria-label={section.title}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.04em] text-tertiary">
                {section.title}
              </h3>
              <div className="overflow-hidden rounded-xl border border-border bg-primary">
                {section.actions.map((action) => {
                  const definition = definitions.get(action);
                  if (!definition) return null;
                  const bindings = getShortcutsForAction(action, shortcuts);
                  return (
                    <div
                      key={action}
                      className="flex min-h-12 items-center justify-between gap-4 border-b border-border px-4 py-2.5 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-primary">
                          {definition.label}
                        </div>
                        <div className="mt-0.5 text-xs text-tertiary">
                          {definition.description}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {bindings.map((binding, index) => (
                          <kbd
                            key={binding}
                            title={index === 0 ? "60% keyboard" : "Arrow-key alternative"}
                            className="rounded-md border border-border bg-secondary px-2 py-1 font-mono text-[11px] text-secondary shadow-sm"
                          >
                            {formatShortcut(binding)}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </Modal.Content>
    </Modal.Root>
  );
}
