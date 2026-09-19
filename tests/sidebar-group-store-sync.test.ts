import { describe, expect, mock, test } from "bun:test";
import * as tauriCore from "@tauri-apps/api/core";
import type { Repository, WorktreeInfo } from "../src/types";
import type { PRStatus } from "../src/types/github";

let diskValues = new Map<string, unknown>();
let cacheValues = new Map<string, unknown>();
let reloadHandler = async () => {
  cacheValues = new Map(diskValues);
};
let invokeHandler = async (_command: string) => undefined;
let saveError: Error | null = null;
let saveHandler: (() => Promise<void>) | null = null;

mock.module("@tauri-apps/api/core", () => ({
  ...tauriCore,
  invoke: (command: string) => invokeHandler(command),
}));

const fakeStore = {
  async get<T>(key: string): Promise<T | null> {
    return (cacheValues.get(key) as T | undefined) ?? null;
  },
  async set(key: string, value: unknown): Promise<void> {
    cacheValues.set(key, structuredClone(value));
  },
  async delete(key: string): Promise<boolean> {
    return cacheValues.delete(key);
  },
  async save(): Promise<void> {
    await saveHandler?.();
    if (saveError) throw saveError;
    diskValues = new Map(cacheValues);
  },
  async reload(): Promise<void> {
    await reloadHandler();
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

const alpha: WorktreeInfo = {
  name: "alpha",
  path: "/repo/alpha",
  branch: "alpha",
  last_modified: null,
};
const beta: WorktreeInfo = {
  name: "beta",
  path: "/repo/beta",
  branch: "beta",
  last_modified: null,
};
const repository: Repository = {
  info: { name: "repo", path: "/repo" },
  worktrees: [alpha, beta],
  isExpanded: true,
};

const mergedPRStatus: PRStatus = {
  number: 120,
  title: "Merged PR",
  url: "https://github.com/sanxroz/autopilot/pull/120",
  state: "merged",
  merged: true,
  draft: false,
  review_decision: null,
  checks_status: "success",
  mergeable: null,
  additions: 1,
  deletions: 0,
  head_branch: "alpha",
  base_branch: "master",
  author: "sanxroz",
  created_at: "2026-09-13T00:00:00Z",
  updated_at: "2026-09-13T00:00:00Z",
  labels: [],
  requested_reviewers: [],
  has_unresolved_review_threads: false,
  is_bot: false,
};

describe("sidebar group store synchronization", () => {
  test("invalidates cached PR status when the worktree branch changes", async () => {
    invokeHandler = async (command) =>
      command === "get_worktree_branch_name" ? "main" : undefined;
    useAppStore.setState({
      repositories: [repository],
      selectedWorktree: alpha,
      prStatusByWorktreePath: { [alpha.path]: mergedPRStatus },
    });

    try {
      await useAppStore.getState().updateWorktreeBranch(alpha.path);

      expect(useAppStore.getState().repositories[0]?.worktrees[0]?.branch).toBe("main");
      expect(useAppStore.getState().selectedWorktree?.branch).toBe("main");
      expect(useAppStore.getState().prStatusByWorktreePath[alpha.path]).toBeUndefined();

      useAppStore.getState().setPRStatusBatch([{
        repo_path: repository.info.path,
        statuses: [mergedPRStatus],
        worktree_statuses: [{
          worktree_path: alpha.path,
          branch: "alpha",
          status: mergedPRStatus,
        }],
        checked_worktrees: [alpha.path],
        failed_worktrees: [],
      }]);

      expect(useAppStore.getState().prStatusByWorktreePath[alpha.path]).toBeUndefined();

      useAppStore.getState().setPRStatusBatch([{
        repo_path: repository.info.path,
        statuses: [],
        worktree_statuses: [{
          worktree_path: alpha.path,
          branch: "alpha",
          status: null,
        }],
        checked_worktrees: [alpha.path],
        failed_worktrees: [],
      }]);

      expect(useAppStore.getState().prStatusByBranch[repository.info.path]?.alpha).toBeUndefined();
    } finally {
      invokeHandler = async () => undefined;
    }
  });

  test("keeps cached PR status when HEAD changes on the same branch", async () => {
    invokeHandler = async (command) =>
      command === "get_worktree_branch_name" ? "alpha" : undefined;
    useAppStore.setState({
      repositories: [repository],
      selectedWorktree: alpha,
      prStatusByWorktreePath: { [alpha.path]: mergedPRStatus },
    });

    try {
      await useAppStore.getState().updateWorktreeBranch(alpha.path);

      expect(useAppStore.getState().prStatusByWorktreePath[alpha.path]).toBe(mergedPRStatus);

      const updatedStatus = { ...mergedPRStatus, title: "Updated merged PR" };
      useAppStore.getState().setPRStatusBatch([{
        repo_path: repository.info.path,
        statuses: [updatedStatus],
        worktree_statuses: [{
          worktree_path: alpha.path,
          branch: "alpha",
          status: updatedStatus,
        }],
        checked_worktrees: [alpha.path],
        failed_worktrees: [],
      }]);

      expect(useAppStore.getState().prStatusByWorktreePath[alpha.path]).toBe(updatedStatus);
    } finally {
      invokeHandler = async () => undefined;
    }
  });

  test("keeps branch PR status when a stale worktree response targets a branch still in use", () => {
    const secondAlpha = { ...beta, branch: "alpha" };
    useAppStore.setState({
      repositories: [{ ...repository, worktrees: [alpha, secondAlpha] }],
      prStatusByBranch: {
        [repository.info.path]: { alpha: mergedPRStatus },
      },
      prStatusByWorktreePath: { [secondAlpha.path]: mergedPRStatus },
    });

    useAppStore.getState().setPRStatusBatch([{
      repo_path: repository.info.path,
      statuses: [],
      worktree_statuses: [{
        worktree_path: "/repo/removed-worktree",
        branch: "alpha",
        status: null,
      }],
      checked_worktrees: ["/repo/removed-worktree"],
      failed_worktrees: [],
    }]);

    expect(
      useAppStore.getState().prStatusByBranch[repository.info.path]?.alpha
    ).toBe(mergedPRStatus);
    expect(
      useAppStore.getState().prStatusByWorktreePath[secondAlpha.path]
    ).toBe(mergedPRStatus);
  });

  test("persists reordered Spaces", async () => {
    const secondRepository: Repository = {
      ...repository,
      info: { name: "second", path: "/second" },
    };
    diskValues = new Map([["repositoryPaths", ["/repo", "/second"]]]);
    cacheValues = new Map(diskValues);
    useAppStore.setState({ repositories: [repository, secondRepository] });

    await useAppStore.getState().reorderRepositories(["/second", "/repo"]);

    expect(useAppStore.getState().repositories.map((repo) => repo.info.path)).toEqual([
      "/second",
      "/repo",
    ]);
    expect(diskValues.get("repositoryPaths")).toEqual(["/second", "/repo"]);
  });

  test("restores the previous Space order when persistence fails", async () => {
    const secondRepository: Repository = {
      ...repository,
      info: { name: "second", path: "/second" },
    };
    const previousRepositories = [repository, secondRepository];
    useAppStore.setState({ repositories: previousRepositories });
    saveError = new Error("disk full");

    try {
      await expect(
        useAppStore.getState().reorderRepositories(["/second", "/repo"]),
      ).rejects.toThrow("disk full");

      expect(useAppStore.getState().repositories).toBe(previousRepositories);
    } finally {
      saveError = null;
    }
  });

  test("restores Space order without discarding metadata updated during a failed save", async () => {
    const secondRepository: Repository = {
      ...repository,
      info: { name: "second", path: "/second" },
    };
    diskValues = new Map([["repositoryPaths", ["/repo", "/second"]]]);
    cacheValues = new Map(diskValues);
    useAppStore.setState({ repositories: [repository, secondRepository] });
    let markSaveStarted!: () => void;
    const saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve;
    });
    let releaseSave!: () => void;
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    saveHandler = async () => {
      markSaveStarted();
      await saveGate;
    };
    saveError = new Error("disk full");

    try {
      const reorder = useAppStore.getState().reorderRepositories(["/second", "/repo"]);
      await saveStarted;
      useAppStore.setState((state) => ({
        repositories: state.repositories.map((repo) => repo.info.path === "/repo"
          ? { ...repo, info: { ...repo.info, avatarUrl: "updated-avatar" } }
          : repo),
      }));
      releaseSave();

      await expect(reorder).rejects.toThrow("disk full");
      expect(useAppStore.getState().repositories.map((repo) => repo.info.path)).toEqual([
        "/repo",
        "/second",
      ]);
      expect(useAppStore.getState().repositories[0]?.info.avatarUrl).toBe("updated-avatar");
      expect(diskValues.get("repositoryPaths")).toEqual(["/repo", "/second"]);
    } finally {
      saveHandler = null;
      saveError = null;
    }
  });

  test("restores the persisted Space order when overlapping saves fail", async () => {
    const secondRepository: Repository = {
      ...repository,
      info: { name: "second", path: "/second" },
    };
    const previousRepositories = [repository, secondRepository];
    diskValues = new Map([["repositoryPaths", ["/repo", "/second"]]]);
    cacheValues = new Map(diskValues);
    useAppStore.setState({ repositories: previousRepositories });
    saveError = new Error("disk full");

    try {
      const first = useAppStore.getState().reorderRepositories(["/second", "/repo"]);
      const second = useAppStore.getState().reorderRepositories(["/repo", "/second"]);

      await expect(first).rejects.toThrow("disk full");
      await expect(second).rejects.toThrow("disk full");

      expect(useAppStore.getState().repositories).toBe(previousRepositories);
      expect(diskValues.get("repositoryPaths")).toEqual(["/repo", "/second"]);
    } finally {
      saveError = null;
    }
  });

  test("does not apply a stale refresh over a local group change", async () => {
    diskValues = new Map([["sidebarGroupsByRepo", {}]]);
    cacheValues = new Map(diskValues);
    let markReloadStarted!: () => void;
    const reloadStarted = new Promise<void>((resolve) => {
      markReloadStarted = resolve;
    });
    let releaseReload!: () => void;
    const reloadGate = new Promise<void>((resolve) => {
      releaseReload = resolve;
    });
    reloadHandler = async () => {
      markReloadStarted();
      await reloadGate;
      cacheValues = new Map(diskValues);
    };
    useAppStore.setState({
      repositories: [repository],
      worktreeOrdersByRepo: { "/repo": [alpha.path, beta.path] },
      sidebarGroupsByRepo: {},
    });

    const refresh = useAppStore.getState().refreshSidebarGroupsFromDisk();
    await reloadStarted;
    const create = useAppStore.getState().createSidebarGroup("/repo", alpha.path, beta.path);
    releaseReload();
    await Promise.all([refresh, create]);

    const localGroups = useAppStore.getState().sidebarGroupsByRepo["/repo"];
    const persistedGroups = diskValues.get("sidebarGroupsByRepo") as Record<string, unknown[]>;
    expect(localGroups).toHaveLength(1);
    expect(localGroups[0].worktreePaths).toEqual([beta.path, alpha.path]);
    expect(persistedGroups["/repo"]).toHaveLength(1);
  });

  test("renaming a newly created group preserves its members", async () => {
    useAppStore.setState({
      repositories: [repository],
      worktreeOrdersByRepo: { "/repo": [alpha.path, beta.path] },
      sidebarGroupsByRepo: {},
    });

    const groupId = await useAppStore
      .getState()
      .createSidebarGroup("/repo", alpha.path, beta.path);
    if (!groupId) throw new Error("Expected the group to be created");

    await useAppStore
      .getState()
      .renameSidebarGroup("/repo", groupId, "Analytics");

    expect(useAppStore.getState().sidebarGroupsByRepo["/repo"]).toEqual([
      {
        id: groupId,
        name: "Analytics",
        worktreePaths: [beta.path, alpha.path],
      },
    ]);
    expect(diskValues.get("sidebarGroupsByRepo")).toEqual({
      "/repo": [
        {
          id: groupId,
          name: "Analytics",
          worktreePaths: [beta.path, alpha.path],
        },
      ],
    });
  });

  test("local settings writes preserve groups added externally", async () => {
    const externalGroups = {
      "/repo": [{ id: "external", name: "External", worktreePaths: [alpha.path] }],
    };
    diskValues = new Map([["sidebarGroupsByRepo", externalGroups]]);
    cacheValues = new Map();
    reloadHandler = async () => {
      cacheValues = new Map(diskValues);
    };

    await useAppStore.getState().setDefaultAIAgent("codex");
    expect(diskValues.get("sidebarGroupsByRepo")).toEqual(externalGroups);

    const newerExternalGroups = {
      "/repo": [{ id: "newer", name: "Newer external", worktreePaths: [beta.path] }],
    };
    diskValues.set("sidebarGroupsByRepo", newerExternalGroups);
    await useAppStore.getState().setThemeMode("dark");
    expect(diskValues.get("sidebarGroupsByRepo")).toEqual(newerExternalGroups);
  });

  test("waits for a CLI settings lock before reloading and saving", async () => {
    const externalGroups = {
      "/repo": [{ id: "cli", name: "CLI", worktreePaths: [alpha.path] }],
    };
    diskValues = new Map();
    cacheValues = new Map();
    reloadHandler = async () => {
      cacheValues = new Map(diskValues);
    };
    let markAcquireStarted!: () => void;
    const acquireStarted = new Promise<void>((resolve) => {
      markAcquireStarted = resolve;
    });
    let releaseAcquire!: () => void;
    const acquireGate = new Promise<void>((resolve) => {
      releaseAcquire = resolve;
    });
    const commands: string[] = [];
    invokeHandler = async (command) => {
      commands.push(command);
      if (command === "acquire_settings_lock") {
        markAcquireStarted();
        await acquireGate;
      }
    };

    const guiWrite = useAppStore.getState().setDefaultAIAgent("claude");
    await acquireStarted;
    diskValues.set("sidebarGroupsByRepo", externalGroups);
    releaseAcquire();
    await guiWrite;

    expect(diskValues.get("sidebarGroupsByRepo")).toEqual(externalGroups);
    expect(commands).toEqual(["acquire_settings_lock", "release_settings_lock"]);
    invokeHandler = async () => undefined;
  });

  test("releases the settings lock when reloading fails", async () => {
    const commands: string[] = [];
    invokeHandler = async (command) => {
      commands.push(command);
    };
    reloadHandler = async () => {
      throw new Error("reload failed");
    };

    await expect(useAppStore.getState().setDefaultAIAgent("codex")).rejects.toThrow("reload failed");
    expect(commands).toEqual(["acquire_settings_lock", "release_settings_lock"]);
    invokeHandler = async () => undefined;
    reloadHandler = async () => {
      cacheValues = new Map(diskValues);
    };
  });
});
