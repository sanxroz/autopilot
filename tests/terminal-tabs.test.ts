import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Repository, TerminalPane, WorktreeInfo } from "../src/types";

type InvokeHandler = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

let invokeHandler: InvokeHandler = async () => undefined;
const invokeMock = mock((command: string, args?: Record<string, unknown>) =>
  invokeHandler(command, args),
);

const tauriCore = await import("@tauri-apps/api/core");
mock.module("@tauri-apps/api/core", () => ({ ...tauriCore, invoke: invokeMock }));

const { useAppStore } = await import("../src/store");

const worktree: WorktreeInfo = {
  name: "layout-tabs",
  path: "/repos/layout-tabs",
  branch: "layout-tabs",
  last_modified: null,
};

const repository: Repository = {
  info: { name: "repo", path: "/repos/repo" },
  worktrees: [worktree],
  isExpanded: true,
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
    invokeHandler = async () => undefined;
    invokeMock.mockClear();
    useAppStore.setState({
      repositories: [repository],
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

  test("opening a browser tab preserves the terminal layout", () => {
    useAppStore.getState().openBrowserTab("http://localhost:3000");

    const state = useAppStore.getState();
    expect(state.currentTerminalTabs).toHaveLength(3);
    expect(state.currentTerminalTabs[2].browserUrl).toBe("http://localhost:3000/");
    expect(state.currentTerminals).toEqual([]);
    expect(state.terminalsByWorktree[worktree.path].activeTabId).toBe(
      state.currentTerminalTabs[2].id,
    );

    useAppStore.getState().setActiveTerminalTab("layout-1");
    expect(
      useAppStore.getState().currentTerminals.map((terminal) => terminal.id),
    ).toEqual(["terminal-1", "terminal-2"]);
  });

  test("a pending terminal stays with its originating layout", async () => {
    let resolveSpawn!: (result: { terminal_id: string }) => void;
    invokeHandler = (command) =>
      command === "spawn_terminal"
        ? new Promise<{ terminal_id: string }>((resolve) => {
            resolveSpawn = resolve;
          })
        : Promise.resolve(undefined);

    const addTerminal = useAppStore.getState().addTerminal();
    useAppStore.getState().openBrowserTab("http://localhost:3000");
    const browserTabId = useAppStore.getState().currentActiveTerminalTabId;
    resolveSpawn({ terminal_id: "terminal-4" });
    await addTerminal;

    const state = useAppStore.getState();
    expect(state.currentActiveTerminalTabId).toBe(browserTabId);
    expect(state.currentTerminals).toEqual([]);
    expect(
      state.currentTerminalTabs.find((tab) => tab.id === browserTabId)?.terminals,
    ).toEqual([]);
    expect(state.currentTerminalTabs[0].terminals.map((terminal) => terminal.id)).toEqual([
      "terminal-1",
      "terminal-2",
      "terminal-4",
    ]);
  });

  test("opening the same URL focuses its existing browser tab", () => {
    useAppStore.getState().openBrowserTab("http://localhost:3000");
    const browserTabId = useAppStore.getState().currentActiveTerminalTabId;
    useAppStore.getState().setActiveTerminalTab("layout-1");

    useAppStore.getState().openBrowserTab("http://localhost:3000");

    expect(useAppStore.getState().currentActiveTerminalTabId).toBe(browserTabId);
    expect(useAppStore.getState().currentTerminalTabs).toHaveLength(3);
  });

  test("rejects external browser tabs", () => {
    useAppStore.getState().openBrowserTab("https://example.com");

    expect(useAppStore.getState().currentTerminalTabs).toEqual(tabs);
  });

  test("persists browser navigation in its tab", () => {
    useAppStore.getState().openBrowserTab("http://localhost:3000");
    const browserTabId = useAppStore.getState().currentActiveTerminalTabId!;

    useAppStore.getState().updateBrowserTabUrl(browserTabId, "http://localhost:5173/app");

    expect(useAppStore.getState().currentTerminalTabs[2].browserUrl).toBe(
      "http://localhost:5173/app",
    );
  });

  test("a pending new tab stays with its originating worktree", async () => {
    const otherWorktree: WorktreeInfo = {
      name: "other",
      path: "/repos/other",
      branch: "other",
      last_modified: null,
    };
    const otherTab: TerminalPane = {
      id: "other-layout",
      terminals: [
        {
          id: "other-terminal",
          worktreePath: otherWorktree.path,
          worktreeName: otherWorktree.name,
        },
      ],
      activeTerminalId: "other-terminal",
    };
    let resolveSpawn!: (result: { terminal_id: string }) => void;
    invokeHandler = (command) =>
      command === "spawn_terminal"
        ? new Promise<{ terminal_id: string }>((resolve) => {
            resolveSpawn = resolve;
          })
        : Promise.resolve(undefined);

    const createTab = useAppStore.getState().createTerminalTab();
    useAppStore.setState((state) => ({
      repositories: [
        repository,
        {
          info: { name: "other", path: "/repos/other" },
          worktrees: [otherWorktree],
          isExpanded: true,
        },
      ],
      selectedWorktree: otherWorktree,
      currentTerminalTabs: [otherTab],
      currentActiveTerminalTabId: otherTab.id,
      currentTerminals: otherTab.terminals,
      currentActiveTerminalId: otherTab.activeTerminalId,
      terminalsByWorktree: {
        ...state.terminalsByWorktree,
        [otherWorktree.path]: { tabs: [otherTab], activeTabId: otherTab.id },
      },
    }));
    resolveSpawn({ terminal_id: "new-terminal" });

    await createTab;

    const state = useAppStore.getState();
    expect(state.currentTerminalTabs).toEqual([otherTab]);
    expect(state.terminalsByWorktree[worktree.path].tabs.map((tab) => tab.id)).toEqual([
      "layout-1",
      "layout-2",
      "new-terminal",
    ]);
  });

  test("a pending tab is closed when its worktree was deleted", async () => {
    let resolveSpawn!: (result: { terminal_id: string }) => void;
    invokeHandler = (command) =>
      command === "spawn_terminal"
        ? new Promise<{ terminal_id: string }>((resolve) => {
            resolveSpawn = resolve;
          })
        : Promise.resolve(undefined);

    const createTab = useAppStore.getState().createTerminalTab();
    useAppStore.setState({ repositories: [], selectedWorktree: null });
    resolveSpawn({ terminal_id: "orphan-terminal" });

    expect(await createTab).toBeNull();
    expect(invokeMock).toHaveBeenCalledWith("close_terminal", {
      terminalId: "orphan-terminal",
    });
    expect(
      useAppStore.getState().terminalsByWorktree[worktree.path].tabs.map((tab) => tab.id),
    ).toEqual(["layout-1", "layout-2"]);
  });
});
