import { describe, expect, mock, test } from "bun:test";
import * as tauriCore from "@tauri-apps/api/core";
import type { Repository, WorktreeInfo } from "../src/types";

let diskValues = new Map<string, unknown>();
let cacheValues = new Map<string, unknown>();
let reloadHandler = async () => {
  cacheValues = new Map(diskValues);
};
let invokeHandler = async (_command: string) => undefined;
let saveError: Error | null = null;

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

describe("sidebar group store synchronization", () => {
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
