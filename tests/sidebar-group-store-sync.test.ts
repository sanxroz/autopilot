import { describe, expect, mock, test } from "bun:test";
import type { Repository, WorktreeInfo } from "../src/types";

let diskValues = new Map<string, unknown>();
let cacheValues = new Map<string, unknown>();
let reloadHandler = async () => {
  cacheValues = new Map(diskValues);
};

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
});
