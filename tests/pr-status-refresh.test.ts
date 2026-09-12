import { beforeEach, describe, expect, mock, test } from "bun:test";

type ResolveRequest = (results: unknown[]) => void;

const requests: ResolveRequest[] = [];
const invoke = mock(
  () => new Promise<unknown[]>((resolve) => requests.push(resolve)),
);
const setPRStatusBatch = mock((_results: unknown[]) => {});
const state = {
  repositories: [{
    info: { path: "/repo" },
    worktrees: [{
      path: "/repo/worktree",
      branch: "feature",
      head_oid: null,
    }],
  }],
  githubSettings: { ghCliAvailable: true },
  collapsedRepos: new Set<string>(),
  setPRStatusBatch,
};
const useAppStore = Object.assign(() => state, { getState: () => state });

mock.module("@tauri-apps/api/core", () => ({ invoke }));
mock.module("../src/store", () => ({ useAppStore }));

const { refreshPRStatuses } = await import("../src/hooks/usePRStatus");

describe("refreshPRStatuses", () => {
  beforeEach(() => {
    requests.length = 0;
    setPRStatusBatch.mockClear();
    state.repositories = [{
      info: { path: "/repo" },
      worktrees: [{
        path: "/repo/worktree",
        branch: "feature",
        head_oid: null,
      }],
    }];
    state.collapsedRepos = new Set<string>();
  });

  test("discards an older response that resolves after a newer refresh", async () => {
    const older = refreshPRStatuses();
    const newer = refreshPRStatuses("/repo");
    const freshResults = [{ repo_path: "/repo", statuses: [], failed_worktrees: [] }];

    requests[1]?.(freshResults);
    await newer;
    requests[0]?.([{ repo_path: "/repo", statuses: [], failed_worktrees: [] }]);
    await older;

    expect(setPRStatusBatch).toHaveBeenCalledTimes(1);
    expect(setPRStatusBatch).toHaveBeenCalledWith(freshResults);
  });

  test("keeps overlapping responses for different repositories", async () => {
    state.repositories.push({
      info: { path: "/visible" },
      worktrees: [{
        path: "/visible/worktree",
        branch: "feature",
        head_oid: null,
      }],
    });
    state.collapsedRepos = new Set(["/repo"]);

    const collapsedRefresh = refreshPRStatuses("/repo");
    const visibleRefresh = refreshPRStatuses();
    const collapsedResults = [{ repo_path: "/repo", statuses: [], failed_worktrees: [] }];
    const visibleResults = [{ repo_path: "/visible", statuses: [], failed_worktrees: [] }];

    requests[1]?.(visibleResults);
    await visibleRefresh;
    requests[0]?.(collapsedResults);
    await collapsedRefresh;

    expect(setPRStatusBatch).toHaveBeenCalledTimes(2);
    expect(setPRStatusBatch).toHaveBeenNthCalledWith(1, visibleResults);
    expect(setPRStatusBatch).toHaveBeenNthCalledWith(2, collapsedResults);
  });
});
