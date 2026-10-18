import { expect, mock, test } from "bun:test";
import * as tauriCore from "@tauri-apps/api/core";
import type { Repository, WorktreeInfo } from "../src/types";

const closeCalls: string[] = [];

mock.module("@tauri-apps/api/core", () => ({
  ...tauriCore,
  invoke: async (command: string, args?: { worktreePath?: string }) => {
    if (command === "close_terminals_for_worktree" && args?.worktreePath) closeCalls.push(args.worktreePath);
    if (command === "get_all_worktrees_process_status") return {};
    if (command === "get_terminal_diagnostics") return [];
    return undefined;
  },
}));

const fakeStore = {
  async get() { return null; },
  async set() {},
  async delete() { return true; },
  async save() {},
  async reload() {},
};
mock.module("@tauri-apps/plugin-store", () => ({
  LazyStore: class { constructor() { return fakeStore; } },
  load: async () => fakeStore,
}));

const { useAppStore } = await import("../src/store");

const REPOS = 10;
const WORKTREES_PER_REPO = 30;
const TERMINALS_PER_WORKTREE = 3;

function makeRepo(index: number): Repository {
  const root = `/repo-${index}`;
  const worktrees: WorktreeInfo[] = Array.from({ length: WORKTREES_PER_REPO }, (_, w) => ({
    name: `wt-${w}`,
    path: `${root}/wt-${w}`,
    branch: `wt-${w}`,
    last_modified: null,
  }));
  return { info: { name: `repo-${index}`, path: root }, worktrees, isExpanded: true };
}

function seed(repos: Repository[]) {
  const terminalsByWorktree: Record<string, { tabs: never[] | unknown[]; activeTabId: string | null }> = {};
  const terminalAgentById: Record<string, { agent: "claude" }> = {};
  const processStatusByPath: Record<string, "agent_running"> = {};
  for (const repo of repos) {
    for (const wt of repo.worktrees) {
      const terminals = Array.from({ length: TERMINAL_PER_TAB() }, (_, t) => {
        const id = `${wt.path}#${t}`;
        terminalAgentById[id] = { agent: "claude" };
        return { id, worktreePath: wt.path, worktreeName: wt.name };
      });
      terminalsByWorktree[wt.path] = { tabs: [{ id: `${wt.path}-tab`, terminals, activeTerminalId: terminals[0].id }], activeTabId: `${wt.path}-tab` };
      processStatusByPath[wt.path] = "agent_running";
    }
  }
  // SAFETY: the stress fixtures mirror the store's record shapes; only the keys matter here.
  useAppStore.setState({ repositories: repos, terminalsByWorktree, terminalAgentById, processStatusByPath } as never);
}

function TERMINAL_PER_TAB() {
  return TERMINALS_PER_WORKTREE;
}

test("removing repositories frees every per-worktree entry and closes every terminal", () => {
  closeCalls.length = 0;
  const repos = Array.from({ length: REPOS }, (_, i) => makeRepo(i));
  seed(repos);
  const total = REPOS * WORKTREES_PER_REPO;
  expect(Object.keys(useAppStore.getState().terminalsByWorktree)).toHaveLength(total);

  for (const repo of repos) useAppStore.getState().removeRepository(repo.info.path);

  const state = useAppStore.getState();
  expect(state.repositories).toHaveLength(0);
  expect(Object.keys(state.terminalsByWorktree)).toHaveLength(0);
  expect(Object.keys(state.terminalAgentById)).toHaveLength(0);
  expect(Object.keys(state.processStatusByPath)).toHaveLength(0);
  expect(closeCalls).toHaveLength(total);
});

test("PR data cache stays bounded under thousands of writes", () => {
  for (let pr = 0; pr < 3000; pr++) {
    useAppStore.getState().setPRDataCache("/repo", pr, { checksResult: null, prDetails: null });
  }
  expect(Object.keys(useAppStore.getState().prDataCache).length).toBeLessThanOrEqual(30);
});

test("add/remove churn does not grow the heap", async () => {
  const churn = async () => {
    const repos = Array.from({ length: REPOS }, (_, i) => makeRepo(i));
    seed(repos);
    for (const repo of repos) useAppStore.getState().removeRepository(repo.info.path);
    // Persistence writes are queued asynchronously; let them drain like they do between real user actions.
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const batch = async (cycles: number) => {
    for (let i = 0; i < cycles; i++) await churn();
    Bun.gc(true);
    return process.memoryUsage().heapUsed;
  };
  // A leak grows every batch; allocator warm-up only grows the first.
  await batch(200);
  const afterWarmup = await batch(200);
  const started = performance.now();
  const afterSecond = await batch(200);
  const elapsedMs = performance.now() - started;
  const growthMb = (afterSecond - afterWarmup) / 1024 / 1024;
  console.log(`churn: 200 cycles x ${REPOS * WORKTREES_PER_REPO} worktrees in ${elapsedMs.toFixed(0)}ms, steady-state heap growth ${growthMb.toFixed(2)}MB`);
  expect(growthMb).toBeLessThan(8);
}, 60000);
