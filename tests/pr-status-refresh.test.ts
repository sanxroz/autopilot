import { describe, expect, mock, test } from "bun:test";

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
});
