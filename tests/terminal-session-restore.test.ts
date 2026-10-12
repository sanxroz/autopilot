import { expect, mock, test } from "bun:test";
import * as tauriCore from "@tauri-apps/api/core";
import type { Repository, TerminalPane, WorktreeInfo } from "../src/types";

let diskValues = new Map<string, unknown>();
let cacheValues = new Map<string, unknown>();
const spawnCalls: Array<{ command: string; args?: Record<string, unknown> }> = [];
let nextTerminalId = 0;
let terminalDiagnostics: Array<{ terminalId: string; agent: string | null }> = [];

mock.module("@tauri-apps/api/core", () => ({
  ...tauriCore,
  invoke: async (command: string, args?: Record<string, unknown>) => {
    if (command.startsWith("spawn_terminal")) {
      spawnCalls.push({ command, args });
      return { terminal_id: `restored-${++nextTerminalId}` };
    }
    if (command === "get_terminal_diagnostics") return terminalDiagnostics;
    if (command === "get_all_worktrees_process_status") return {};
    return undefined;
  },
}));

const fakeStore = {
  async get<T>(key: string): Promise<T | null> {
    // SAFETY: tests only read keys they previously wrote with the matching type.
    return (cacheValues.get(key) as T | undefined) ?? null;
  },
  async set(key: string, value: unknown): Promise<void> {
    cacheValues.set(key, structuredClone(value));
  },
  async delete(key: string): Promise<boolean> {
    return cacheValues.delete(key);
  },
  async save(): Promise<void> {
    diskValues = new Map(cacheValues);
  },
  async reload(): Promise<void> {
    cacheValues = new Map(diskValues);
  },
};

mock.module("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    constructor() {
      return fakeStore;
    }
  },
  load: async () => fakeStore,
}));

const { useAppStore } = await import("../src/store");

const worktree: WorktreeInfo = { name: "alpha", path: "/repo/alpha", branch: "alpha", last_modified: null };
const repository: Repository = { info: { name: "repo", path: "/repo" }, worktrees: [worktree], isExpanded: true };
const terminal = (id: string) => ({ id, worktreePath: worktree.path, worktreeName: worktree.name });
const tabs: TerminalPane[] = [
  { id: "claude", terminals: [terminal("claude"), terminal("shell")], activeTerminalId: "claude" },
  { id: "codex", terminals: [terminal("codex")], activeTerminalId: "codex" },
  { id: "browser", terminals: [], activeTerminalId: null, browserUrl: "http://localhost:3000/" },
];

test("terminal tabs and agent conversations are restored after a restart", async () => {
  useAppStore.setState({
    repositories: [repository],
    selectedWorktree: worktree,
    terminalsByWorktree: { [worktree.path]: { tabs, activeTabId: "codex" } },
  });
  const event = { worktreePath: worktree.path, sessionId: "s", status: "running" as const, timestamp: 1 };
  useAppStore.getState().setAgentRunState({ ...event, terminalId: "claude", agent: "claude", agentSessionId: "abc-123" });
  useAppStore.getState().setAgentRunState({ ...event, terminalId: "codex", agent: "codex" });
  useAppStore.getState().setAgentRunState({ ...event, terminalId: "claude", agent: "claude" });
  // Quitting right away must still persist the pending save.
  await useAppStore.getState().flushSidebarNotesPersistence();

  // Simulate an app restart: in-memory terminals are gone, only disk remains.
  useAppStore.setState({ isInitialized: false, selectedWorktree: null, terminalsByWorktree: {}, terminalAgentById: {} });
  await useAppStore.getState().initialize();
  useAppStore.setState({ repositories: [repository] });
  // A double click while restoring must not resume the agents twice.
  await Promise.all([useAppStore.getState().selectWorktree(worktree), useAppStore.getState().selectWorktree(worktree)]);

  expect(spawnCalls.map(({ command, args }) => args?.command ?? command)).toEqual([
    "claude --resume abc-123",
    "spawn_terminal",
    "codex resume --last",
  ]);
  const state = useAppStore.getState();
  expect(state.currentTerminalTabs.map((tab) => tab.terminals.length)).toEqual([2, 1, 0]);
  expect(state.currentTerminalTabs[2].browserUrl).toBe("http://localhost:3000/");
  expect(state.currentActiveTerminalTabId).toBe(state.currentTerminalTabs[1].id);
  expect(state.currentTerminalTabs[0].activeTerminalId).toBe("restored-1");
  expect(state.terminalAgentById["restored-1"]).toEqual({ agent: "claude", agentSessionId: "abc-123" });
});

test("process polling decides each terminal's agent and keeps hook conversation ids", async () => {
  const event = { worktreePath: worktree.path, sessionId: "s", status: "running" as const, timestamp: 1 };
  useAppStore.setState({ repositories: [repository], terminalAgentById: {} });
  const { setAgentRunState, refreshProcessStatuses } = useAppStore.getState();
  setAgentRunState({ ...event, terminalId: "claude", agent: "claude", agentSessionId: "abc-123" });
  // Droid's global hooks cannot name the agent, so the hook server reports "claude".
  setAgentRunState({ ...event, terminalId: "droid", agent: "claude", agentSessionId: "droid-1" });

  terminalDiagnostics = [
    { terminalId: "claude", agent: "claude" },
    { terminalId: "droid", agent: "droid" },
    { terminalId: "pi", agent: "pi" },
    { terminalId: "shell", agent: null },
  ];
  await refreshProcessStatuses();
  setAgentRunState({ ...event, terminalId: "droid", agent: "claude", agentSessionId: "droid-2" });

  expect(useAppStore.getState().terminalAgentById).toEqual({
    claude: { agent: "claude", agentSessionId: "abc-123" },
    droid: { agent: "droid" },
    pi: { agent: "pi" },
  });

  // Exiting the agent returns the terminal to its shell, so it is no longer resumed.
  terminalDiagnostics = [{ terminalId: "claude", agent: null }];
  await refreshProcessStatuses();
  expect(useAppStore.getState().terminalAgentById).toEqual({});
});
