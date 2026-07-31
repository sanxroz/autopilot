import { beforeEach, describe, expect, test } from "bun:test";
import { useAppStore } from "../src/store";
import type { TerminalPane, WorktreeInfo } from "../src/types";

const worktree: WorktreeInfo = {
  name: "layout-tabs",
  path: "/repos/layout-tabs",
  branch: "layout-tabs",
  last_modified: null,
};

const tabs: TerminalPane[] = [
  {
    id: "layout-1",
    terminals: [
      { id: "terminal-1", worktreePath: worktree.path, worktreeName: worktree.name },
      { id: "terminal-2", worktreePath: worktree.path, worktreeName: worktree.name },
    ],
    activeTerminalId: "terminal-2",
  },
  {
    id: "layout-2",
    terminals: [
      { id: "terminal-3", worktreePath: worktree.path, worktreeName: worktree.name },
    ],
    activeTerminalId: "terminal-3",
  },
];

describe("terminal layout tabs", () => {
  beforeEach(() => {
    useAppStore.setState({
      selectedWorktree: worktree,
      currentTerminalTabs: tabs,
      currentActiveTerminalTabId: tabs[0].id,
      currentTerminals: tabs[0].terminals,
      currentActiveTerminalId: tabs[0].activeTerminalId,
      terminalsByWorktree: {
        [worktree.path]: { tabs, activeTabId: tabs[0].id },
      },
    });
  });

  test("switching tabs swaps the complete terminal layout", () => {
    useAppStore.getState().setActiveTerminalTab("layout-2");

    const state = useAppStore.getState();
    expect(state.currentActiveTerminalTabId).toBe("layout-2");
    expect(state.currentTerminals.map((terminal) => terminal.id)).toEqual([
      "terminal-3",
    ]);
    expect(state.currentActiveTerminalId).toBe("terminal-3");
    expect(state.terminalsByWorktree[worktree.path].activeTabId).toBe("layout-2");
  });

  test("closing the active tab selects the adjacent layout", () => {
    useAppStore.getState().setActiveTerminalTab("layout-2");
    useAppStore.getState().closeTerminalTab("layout-2");

    const state = useAppStore.getState();
    expect(state.currentTerminalTabs.map((tab) => tab.id)).toEqual(["layout-1"]);
    expect(state.currentActiveTerminalTabId).toBe("layout-1");
    expect(state.currentTerminals.map((terminal) => terminal.id)).toEqual([
      "terminal-1",
      "terminal-2",
    ]);
  });

  test("the final terminal layout cannot be closed", () => {
    useAppStore.setState({
      currentTerminalTabs: [tabs[0]],
      currentActiveTerminalTabId: tabs[0].id,
      currentTerminals: tabs[0].terminals,
      currentActiveTerminalId: tabs[0].activeTerminalId,
    });

    useAppStore.getState().closeTerminalTab("layout-1");

    expect(useAppStore.getState().currentTerminalTabs).toHaveLength(1);
  });
});
