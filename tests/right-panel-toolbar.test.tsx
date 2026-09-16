import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as tauriCore from "@tauri-apps/api/core";
import React from "react";
import { Window } from "happy-dom";
import type { PRStatus } from "../src/types/github";

const browserWindow = new Window({ url: "http://localhost" });
Object.assign(globalThis, {
  window: browserWindow,
  document: browserWindow.document,
  navigator: browserWindow.navigator,
  HTMLElement: browserWindow.HTMLElement,
  Element: browserWindow.Element,
  Node: browserWindow.Node,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const readyPRStatus: PRStatus = {
  number: 120,
  title: "Merge feedback",
  url: "https://github.com/sanxroz/autopilot/pull/120",
  state: "open",
  merged: false,
  draft: false,
  review_decision: null,
  checks_status: "success",
  mergeable: "MERGEABLE",
  additions: 1,
  deletions: 0,
  head_branch: "fix/merge-feedback",
  base_branch: "master",
  author: "sanxroz",
  created_at: "2026-09-13T00:00:00Z",
  updated_at: "2026-09-13T00:00:00Z",
  labels: [],
  requested_reviewers: [],
  has_unresolved_review_threads: false,
  is_bot: false,
};

let prStatus: PRStatus | null = readyPRStatus;
let hasMerged = false;
let notesByWorktreePath: Record<string, string> = {};
const storeListeners = new Set<() => void>();
const store = {
  repositories: [{
    info: { path: "/repo" },
    worktrees: [{ path: "/repo/worktree" }],
  }],
  installedIdes: [],
  isLoadingInstalledIdes: false,
  getSidebarNotesMarkdown: (worktreePath: string | null) =>
    worktreePath ? notesByWorktreePath[worktreePath] ?? "" : "",
  setSidebarNotesMarkdown: async (worktreePath: string, notes: string) => {
    notesByWorktreePath = { ...notesByWorktreePath, [worktreePath]: notes };
    storeListeners.forEach((listener) => listener());
  },
};

mock.module("../src/store", () => ({
  useAppStore: (selector: (state: typeof store) => unknown) =>
    React.useSyncExternalStore(
      (listener) => {
        storeListeners.add(listener);
        return () => storeListeners.delete(listener);
      },
      () => selector(store),
    ),
}));
mock.module("../src/hooks/usePRStatus", () => ({
  usePRStatusForWorktree: () => prStatus,
}));
mock.module("../src/hooks/useMergePR", () => ({
  useMergePR: () => ({ isMerging: false, hasMerged, handleMerge: () => {} }),
}));
mock.module("@tauri-apps/api/core", () => ({
  ...tauriCore,
  invoke: async () => false,
}));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));

const passthrough = ({ children }: { children?: React.ReactNode }) => children;
mock.module("../src/components/ui/dropdown-menu", () => ({
  DropdownMenu: passthrough,
  DropdownMenuContent: passthrough,
  DropdownMenuItem: passthrough,
  DropdownMenuTrigger: passthrough,
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
type Root = import("react-dom/client").Root;
const { RightPanelToolbar } = await import("../src/components/RightPanelToolbar");
const { NotesTab } = await import("../src/components/RightPanel/NotesTab");
const { Provider: TooltipProvider } = await import("../src/components/ui/tooltip");

let container: HTMLDivElement;
let root: Root;

async function renderToolbar() {
  await act(async () => {
    root.render(
      <TooltipProvider>
        <RightPanelToolbar
          worktreePath="/repo/worktree"
          activeTab="git"
          onActiveTabChange={() => {}}
        />
      </TooltipProvider>
    );
  });
}

beforeEach(() => {
  prStatus = readyPRStatus;
  hasMerged = false;
  notesByWorktreePath = {};
  container = browserWindow.document.createElement("div");
  browserWindow.document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("RightPanelToolbar", () => {
  test("shows non-interactive merged status for either merged signal", async () => {
    prStatus = { ...readyPRStatus, state: "merged", merged: true };
    await renderToolbar();

    expect(container.querySelector('[role="status"]')?.textContent).toContain("Merged");
    expect(container.querySelector('[aria-label="Merge pull request"]')).toBeNull();

    prStatus = readyPRStatus;
    hasMerged = true;
    await renderToolbar();

    expect(container.querySelector('[role="status"]')?.textContent).toContain("Merged");
    expect(container.querySelector('[aria-label="Merge pull request"]')).toBeNull();
  });

  test("shows the Merge button for a ready unmerged PR", async () => {
    await renderToolbar();

    expect(container.querySelector('[aria-label="Merge pull request"]')).not.toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  test("shows neither merge control when merging is unavailable", async () => {
    prStatus = { ...readyPRStatus, checks_status: "pending" };
    await renderToolbar();

    expect(container.querySelector('[aria-label="Merge pull request"]')).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  test("persists edited personal notes and marks the toolbar tab as non-empty", async () => {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <NotesTab worktreePath="/repo/worktree" />
          <RightPanelToolbar
            worktreePath="/repo/worktree"
            activeTab="notes"
            onActiveTabChange={() => {}}
          />
        </TooltipProvider>,
      );
    });

    expect(container.querySelector('[aria-label="Notes"]')).not.toBeNull();
    const textarea = container.querySelector<HTMLTextAreaElement>('[aria-label="Personal notes"]');
    expect(textarea).not.toBeNull();

    await act(async () => {
      if (!textarea) return;
      const valueSetter = Object.getOwnPropertyDescriptor(
        browserWindow.HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(textarea, "Follow up on review feedback");
      textarea.dispatchEvent(new browserWindow.Event("input", { bubbles: true }));
    });

    expect(container.querySelector('[aria-label="Notes, has content"]')).not.toBeNull();

    await act(async () => {
      root.render(
        <TooltipProvider>
          <NotesTab worktreePath={null} />
        </TooltipProvider>,
      );
    });
    await act(async () => {
      root.render(
        <TooltipProvider>
          <NotesTab worktreePath="/repo/worktree" />
        </TooltipProvider>,
      );
    });

    expect(container.querySelector<HTMLTextAreaElement>('[aria-label="Personal notes"]')?.value)
      .toBe("Follow up on review feedback");
  });
});
