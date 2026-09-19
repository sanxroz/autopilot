import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import React, { forwardRef } from "react";
import { Window } from "happy-dom";

const browserWindow = new Window({ url: "http://localhost" });
Object.assign(globalThis, {
  window: browserWindow,
  document: browserWindow.document,
  navigator: browserWindow.navigator,
  HTMLElement: browserWindow.HTMLElement,
  Element: browserWindow.Element,
  Node: browserWindow.Node,
  Event: browserWindow.Event,
  MouseEvent: browserWindow.MouseEvent,
  PointerEvent: browserWindow.PointerEvent,
  getComputedStyle: browserWindow.getComputedStyle.bind(browserWindow),
  requestAnimationFrame: browserWindow.requestAnimationFrame.bind(browserWindow),
  cancelAnimationFrame: browserWindow.cancelAnimationFrame.bind(browserWindow),
  IS_REACT_ACT_ENVIRONMENT: true,
});

const capturedPointers = new Map<number, HTMLElement>();
browserWindow.HTMLElement.prototype.setPointerCapture = function (pointerId: number) {
  capturedPointers.set(pointerId, this);
};
browserWindow.HTMLElement.prototype.scrollIntoView = () => {};

const reorderCalls: string[][] = [];
let reducedMotion = false;
const repositories = ["alpha", "beta", "gamma"].map((path) => ({
  info: { name: path, path },
  worktrees: [],
  isExpanded: true,
}));
const store = {
  repositories,
  addRepository: async () => {},
  removeRepository: () => {},
  reorderRepositories: async (paths: string[]) => {
    reorderCalls.push(paths);
  },
  selectWorktree: async () => {},
  selectedWorktree: null,
  createWorktreeAuto: async () => null,
  deleteWorktree: async () => {},
  createSidebarGroup: async () => null,
  moveWorktreeInSidebar: async () => {},
  renameSidebarGroup: async () => {},
  setThemeMode: () => {},
  toggleSettings: () => {},
  githubSettings: { ghAuthUser: null },
  prStatusByBranch: {},
  prStatusByWorktreePath: {},
  processStatusByPath: {},
  agentRunByWorktreePath: {},
  clearAgentRunState: () => {},
  agentSidebarLifecycleEnabled: true,
  worktreeSetupByRepoPath: {},
  sidebarGroupsByRepo: {},
};
const useAppStore = Object.assign(() => store, { getState: () => store });

mock.module("../src/store", () => ({ useAppStore }));
mock.module("../src/hooks/useTheme", () => ({ useThemeMode: () => "dark" }));
mock.module("@tauri-apps/plugin-dialog", () => ({ open: async () => null }));
mock.module("framer-motion", () => ({
  motion: {
    div: forwardRef<HTMLDivElement, Record<string, unknown>>(
      ({ layout: _layout, animate: _animate, transition: _transition, ...props }, ref) =>
        React.createElement("div", { ...props, ref }),
    ),
  },
  useReducedMotion: () => reducedMotion,
}));

for (const path of [
  "../src/components/NewWorktreeDialog",
  "../src/components/WorktreeItem",
  "../src/components/StackGroup",
  "../src/components/SidebarWorktreeGroup",
  "../src/components/KeyboardShortcutsHelp",
]) {
  mock.module(path, () => ({
    NewWorktreeDialog: () => null,
    WorktreeItem: () => null,
    StackGroup: ({ children }: { children?: React.ReactNode }) => children,
    SidebarWorktreeGroup: ({ children }: { children?: React.ReactNode }) => children,
    KeyboardShortcutsHelp: () => null,
  }));
}

const passthrough = ({ children }: { children?: React.ReactNode }) => children;
const menuItem = ({ children, disabled, onSelect }: {
  children?: React.ReactNode;
  disabled?: boolean;
  onSelect?: () => void;
}) => React.createElement("button", { disabled, onClick: onSelect }, children);
mock.module("../src/components/ui/modal", () => ({
  Root: passthrough,
  Content: passthrough,
  Title: passthrough,
  Description: passthrough,
}));
mock.module("../src/components/ui/dropdown-menu", () => ({
  DropdownMenu: passthrough,
  DropdownMenuContent: passthrough,
  DropdownMenuItem: menuItem,
  DropdownMenuSeparator: () => null,
  DropdownMenuTrigger: passthrough,
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
type Root = import("react-dom/client").Root;
const { Sidebar } = await import("../src/components/Sidebar");
const { Provider: TooltipProvider } = await import("../src/components/ui/tooltip");

let container: HTMLDivElement;
let root: Root;

function pointer(
  target: EventTarget,
  type: string,
  pointerId: number,
  clientY: number,
) {
  const dispatchTarget = target === browserWindow && type !== "pointerdown"
    ? capturedPointers.get(pointerId) ?? browserWindow.document.createElement("div")
    : target;
  dispatchTarget.dispatchEvent(new browserWindow.PointerEvent(type, {
    bubbles: true,
    button: 0,
    isPrimary: true,
    pointerId,
    clientX: 10,
    clientY,
  }));
  if (type === "pointerup" || type === "pointercancel") {
    capturedPointers.delete(pointerId);
  }
}

function spaceButton(path: string) {
  return container.querySelector<HTMLButtonElement>(`button[data-space-path="${path}"]`)!;
}

function renderedOrder() {
  return Array.from(
    container.querySelectorAll<HTMLElement>("[data-space-drop-target='true']"),
    (element) => element.dataset.spacePath,
  );
}

beforeEach(async () => {
  reorderCalls.length = 0;
  capturedPointers.clear();
  reducedMotion = false;
  browserWindow.localStorage.clear();
  container = browserWindow.document.createElement("div");
  browserWindow.document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(
        TooltipProvider,
        null,
        React.createElement(Sidebar, {
          isOpen: true,
          captainTerminalRepoPath: null,
          onToggleCaptainTerminal: () => {},
        }),
      ),
    );
  });

  Array.from(
    container.querySelectorAll<HTMLElement>("[data-space-drop-target='true']"),
  ).forEach((element) => {
    element.getBoundingClientRect = () => {
      const currentIndex = Array.from(
        container.querySelectorAll<HTMLElement>("[data-space-drop-target='true']"),
      ).indexOf(element);
      return {
        x: 0,
        y: currentIndex * 48,
        top: currentIndex * 48,
        right: 44,
        bottom: currentIndex * 48 + 44,
        left: 0,
        width: 44,
        height: 44,
        toJSON: () => ({}),
      };
    };
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("Sidebar Space dragging", () => {
  test("shows one combined usage control", () => {
    const usageControls = container.querySelectorAll<HTMLButtonElement>(
      'button[aria-label*="usage"]',
    );

    expect(usageControls).toHaveLength(1);
    expect(usageControls[0]?.classList.contains("w-11")).toBe(true);
  });

  test("unmounts the usage control while the sidebar is closed", async () => {
    await act(async () => {
      root.render(
        React.createElement(
          TooltipProvider,
          null,
          React.createElement(Sidebar, {
            isOpen: false,
            captainTerminalRepoPath: null,
            onToggleCaptainTerminal: () => {},
          }),
        ),
      );
    });

    expect(container.querySelector('button[aria-label*="usage"]')).toBeNull();
  });

  test("waits for the owner pointer to cross the threshold and restores on cancel", async () => {
    await act(async () => pointer(spaceButton("alpha"), "pointerdown", 7, 20));
    await act(async () => pointer(browserWindow, "pointermove", 7, 29));
    expect(renderedOrder()).toEqual(["alpha", "beta", "gamma"]);

    await act(async () => pointer(browserWindow, "pointermove", 8, 120));
    expect(renderedOrder()).toEqual(["alpha", "beta", "gamma"]);

    await act(async () => pointer(browserWindow, "pointermove", 7, 120));
    expect(renderedOrder()).toEqual(["beta", "gamma", "alpha"]);

    await act(async () => pointer(browserWindow, "pointercancel", 7, 120));
    expect(renderedOrder()).toEqual(["alpha", "beta", "gamma"]);
    expect(reorderCalls).toEqual([]);
  });

  test("previews, commits, and suppresses the drag's click", async () => {
    await act(async () => pointer(spaceButton("beta"), "pointerdown", 11, 68));
    await act(async () => pointer(browserWindow, "pointermove", 11, -10));
    expect(renderedOrder()).toEqual(["beta", "alpha", "gamma"]);
    await act(async () => pointer(browserWindow, "pointermove", 11, 40));
    expect(renderedOrder()).toEqual(["beta", "alpha", "gamma"]);

    await act(async () => pointer(browserWindow, "pointerup", 12, -10));
    expect(reorderCalls).toEqual([]);

    await act(async () => pointer(browserWindow, "pointerup", 11, -10));
    expect(reorderCalls).toEqual([["beta", "alpha", "gamma"]]);

    await act(async () => spaceButton("beta").click());
    expect(spaceButton("alpha").getAttribute("aria-pressed")).toBe("true");

    await act(async () => spaceButton("gamma").click());
    expect(spaceButton("gamma").getAttribute("aria-pressed")).toBe("true");
  });

  test("commits a drag when reduced motion is enabled", async () => {
    reducedMotion = true;
    await act(async () => {
      root.render(
        React.createElement(
          TooltipProvider,
          null,
          React.createElement(Sidebar, {
            isOpen: true,
            captainTerminalRepoPath: null,
            onToggleCaptainTerminal: () => {},
          }),
        ),
      );
    });

    await act(async () => pointer(spaceButton("beta"), "pointerdown", 17, 68));
    await act(async () => pointer(browserWindow, "pointermove", 17, -10));
    expect(renderedOrder()).toEqual(["beta", "alpha", "gamma"]);
    await act(async () => pointer(browserWindow, "pointerup", 17, -10));
    expect(reorderCalls).toEqual([["beta", "alpha", "gamma"]]);
  });

  test("moves the active Space from the keyboard-accessible actions menu", async () => {
    const moveDown = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Move down"),
    );
    expect(moveDown?.disabled).toBe(false);

    await act(async () => moveDown?.click());
    expect(reorderCalls).toEqual([["beta", "alpha", "gamma"]]);
  });
});
