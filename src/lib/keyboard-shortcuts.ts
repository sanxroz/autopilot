export type ShortcutAction =
  | "commandMenu"
  | "settings"
  | "toggleSidebar"
  | "toggleWorkspacePanel"
  | "focusTerminal"
  | "previousTerminal"
  | "nextTerminal"
  | "previousSession"
  | "nextSession"
  | "previousLayout"
  | "nextLayout"
  | "showGit"
  | "showNotes"
  | "openWith";

export interface ShortcutDefinition {
  readonly id: ShortcutAction;
  readonly label: string;
  readonly description: string;
  readonly defaultShortcut: string;
  readonly alternateShortcuts?: readonly string[];
}

export type KeyboardShortcutMap = Record<ShortcutAction, string>;

export const SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [
  { id: "commandMenu", label: "Command menu", description: "Search and run any app command", defaultShortcut: "Mod+K" },
  { id: "settings", label: "Settings", description: "Open or close settings", defaultShortcut: "Mod+," },
  { id: "toggleSidebar", label: "Sidebar", description: "Show or hide the session sidebar", defaultShortcut: "Mod+B" },
  { id: "toggleWorkspacePanel", label: "Workspace panel", description: "Show or hide the right panel", defaultShortcut: "Mod+Shift+B" },
  { id: "focusTerminal", label: "Focus terminal", description: "Return keyboard focus to the active terminal", defaultShortcut: "Mod+`" },
  { id: "previousTerminal", label: "Previous terminal", description: "Focus the previous terminal pane", defaultShortcut: "Mod+Alt+[", alternateShortcuts: ["Mod+ArrowLeft"] },
  { id: "nextTerminal", label: "Next terminal", description: "Focus the next terminal pane", defaultShortcut: "Mod+Alt+]", alternateShortcuts: ["Mod+ArrowRight"] },
  { id: "previousSession", label: "Previous session", description: "Select the previous workspace", defaultShortcut: "Mod+[", alternateShortcuts: ["Mod+ArrowUp"] },
  { id: "nextSession", label: "Next session", description: "Select the next workspace", defaultShortcut: "Mod+]", alternateShortcuts: ["Mod+ArrowDown"] },
  { id: "previousLayout", label: "Previous terminal layout", description: "Switch to the previous terminal layout", defaultShortcut: "Mod+Shift+[", alternateShortcuts: ["Mod+Alt+ArrowUp"] },
  { id: "nextLayout", label: "Next terminal layout", description: "Switch to the next terminal layout", defaultShortcut: "Mod+Shift+]", alternateShortcuts: ["Mod+Alt+ArrowDown"] },
  { id: "showGit", label: "Git changes", description: "Open the workspace panel on Git changes", defaultShortcut: "Mod+Shift+G" },
  { id: "showNotes", label: "Notes", description: "Open the workspace panel on Notes", defaultShortcut: "Mod+Shift+N" },
  { id: "openWith", label: "Open With", description: "Open the application picker", defaultShortcut: "Mod+Shift+O" },
];

export const DEFAULT_KEYBOARD_SHORTCUTS = Object.fromEntries(
  SHORTCUT_DEFINITIONS.map(({ id, defaultShortcut }) => [id, defaultShortcut]),
) as KeyboardShortcutMap;

export function mergeKeyboardShortcuts(
  saved?: Partial<KeyboardShortcutMap>,
): KeyboardShortcutMap {
  return { ...DEFAULT_KEYBOARD_SHORTCUTS, ...saved };
}

function normalizedEventKey(event: { key: string; code?: string }): string | null {
  if (["Meta", "Control", "Alt", "Shift"].includes(event.key)) return null;
  if (event.key === " ") return "Space";
  if (event.code === "BracketLeft") return "[";
  if (event.code === "BracketRight") return "]";
  if (event.code === "Comma") return ",";
  if (event.code === "Backquote") return "`";
  return event.key.length === 1 ? event.key.toUpperCase() : event.key;
}

export function shortcutFromKeyboardEvent(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"> & { code?: string },
  isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform),
): string | null {
  const key = normalizedEventKey(event);
  if (!key) return null;

  const modifiers: string[] = [];
  if ((isMac && event.metaKey) || (!isMac && event.ctrlKey)) modifiers.push("Mod");
  if (isMac && event.ctrlKey) modifiers.push("Ctrl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (modifiers.length === 0) return null;
  return [...modifiers, key].join("+");
}

export function getShortcutAction(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"> & { code?: string },
  shortcuts: KeyboardShortcutMap,
  isMac?: boolean,
): ShortcutAction | null {
  const pressed = shortcutFromKeyboardEvent(event, isMac);
  if (!pressed) return null;
  return SHORTCUT_DEFINITIONS.find(
    ({ id, alternateShortcuts }) =>
      shortcuts[id] === pressed || alternateShortcuts?.includes(pressed),
  )?.id ?? null;
}

export function getShortcutsForAction(
  action: ShortcutAction,
  shortcuts: KeyboardShortcutMap,
): readonly string[] {
  const definition = SHORTCUT_DEFINITIONS.find(({ id }) => id === action);
  return [shortcuts[action], ...(definition?.alternateShortcuts ?? [])];
}

export function getShortcutConflict(
  action: ShortcutAction,
  shortcut: string,
  shortcuts: KeyboardShortcutMap,
): ShortcutDefinition | undefined {
  return SHORTCUT_DEFINITIONS.find(
    (definition) =>
      definition.id !== action &&
      getShortcutsForAction(definition.id, shortcuts).includes(shortcut),
  );
}

export function formatShortcut(shortcut: string): string {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  if (!isMac) return shortcut.replace("Mod", "Ctrl");

  return shortcut
    .replace("Mod", "⌘")
    .replace("Ctrl", "⌃")
    .replace("Alt", "⌥")
    .replace("Shift", "⇧")
    .replace("ArrowLeft", "←")
    .replace("ArrowRight", "→")
    .replace("ArrowUp", "↑")
    .replace("ArrowDown", "↓")
    .replaceAll("+", "");
}
