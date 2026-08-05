import { describe, expect, test } from "bun:test";
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  SHORTCUT_DEFINITIONS,
  getShortcutAction,
  getShortcutConflict,
  getShortcutsForAction,
  mergeKeyboardShortcuts,
  shortcutFromKeyboardEvent,
} from "../src/lib/keyboard-shortcuts";

const keyEvent = (key: string, overrides: Partial<KeyboardEvent> = {}) => ({
  key,
  code: "",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
}) as KeyboardEvent;

describe("keyboard shortcuts", () => {
  test("normalizes the platform modifier", () => {
    expect(shortcutFromKeyboardEvent(keyEvent("p", { metaKey: true }), true)).toBe("Mod+P");
    expect(shortcutFromKeyboardEvent(keyEvent("p", { ctrlKey: true }), false)).toBe("Mod+P");
    expect(shortcutFromKeyboardEvent(keyEvent("p"), true)).toBeNull();
  });

  test("matches configured actions", () => {
    expect(getShortcutAction(keyEvent("g", { metaKey: true, shiftKey: true }), DEFAULT_KEYBOARD_SHORTCUTS, true)).toBe("showGit");
  });

  test("keeps default navigation usable without an arrow-key layer", () => {
    expect(Object.values(DEFAULT_KEYBOARD_SHORTCUTS).some((shortcut) => shortcut.includes("Arrow"))).toBe(false);
    expect(getShortcutAction(
      keyEvent("}", { code: "BracketRight", metaKey: true, shiftKey: true }),
      DEFAULT_KEYBOARD_SHORTCUTS,
      true,
    )).toBe("nextLayout");
  });

  test("supports arrow aliases for full-size keyboards", () => {
    expect(getShortcutAction(
      keyEvent("ArrowDown", { metaKey: true }),
      DEFAULT_KEYBOARD_SHORTCUTS,
      true,
    )).toBe("nextSession");
    expect(getShortcutAction(
      keyEvent("ArrowRight", { metaKey: true }),
      DEFAULT_KEYBOARD_SHORTCUTS,
      true,
    )).toBe("nextTerminal");
    expect(getShortcutAction(
      keyEvent("ArrowUp", { metaKey: true, altKey: true }),
      DEFAULT_KEYBOARD_SHORTCUTS,
      true,
    )).toBe("previousLayout");
  });

  test("keeps every default binding unique and the movement model consistent", () => {
    const shortcuts = SHORTCUT_DEFINITIONS.flatMap(({ id }) =>
      getShortcutsForAction(id, DEFAULT_KEYBOARD_SHORTCUTS),
    );
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
    expect(DEFAULT_KEYBOARD_SHORTCUTS.previousSession).toBe("Mod+[");
    expect(DEFAULT_KEYBOARD_SHORTCUTS.nextSession).toBe("Mod+]");
    expect(DEFAULT_KEYBOARD_SHORTCUTS.previousTerminal).toBe("Mod+Alt+[");
    expect(DEFAULT_KEYBOARD_SHORTCUTS.nextTerminal).toBe("Mod+Alt+]");
    expect(DEFAULT_KEYBOARD_SHORTCUTS.previousLayout).toBe("Mod+Shift+[");
    expect(DEFAULT_KEYBOARD_SHORTCUTS.nextLayout).toBe("Mod+Shift+]");
  });

  test("prevents custom bindings from shadowing arrow aliases", () => {
    expect(
      getShortcutConflict(
        "showNotes",
        "Mod+ArrowRight",
        DEFAULT_KEYBOARD_SHORTCUTS,
      )?.id,
    ).toBe("nextTerminal");
  });

  test("keeps defaults for newly added actions", () => {
    expect(mergeKeyboardShortcuts({ showGit: "Mod+Shift+G" })).toEqual({
      ...DEFAULT_KEYBOARD_SHORTCUTS,
      showGit: "Mod+Shift+G",
    });
  });
});
