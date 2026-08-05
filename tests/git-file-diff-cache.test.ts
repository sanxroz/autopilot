import { beforeEach, describe, expect, mock, test } from "bun:test";

const invoke = mock(async () => ({
  patch: "@@ -1 +1 @@\n-old\n+new",
  old_content: null,
  new_content: null,
  worktree_content: null,
  is_binary: false,
}));

mock.module("@tauri-apps/api/core", () => ({ invoke }));

const {
  getGitFileDiffKey,
  getGitFileDiffRendererKey,
  invalidateGitFileDiffCache,
  loadGitFileDiff,
  subscribeToGitFileDiffInvalidation,
} = await import(
  "../src/lib/git-file-diff-cache"
);

describe("git file diff cache", () => {
  beforeEach(() => invoke.mockClear());

  test("keeps patch previews separate from editable file content", () => {
    expect(getGitFileDiffKey("/repo", "file.ts", false, false)).not.toBe(
      getGitFileDiffKey("/repo", "file.ts", false, true),
    );
  });

  test("requests patch-only data for a fast preview", async () => {
    await loadGitFileDiff("/repo", "file.ts", false, false);

    expect(invoke).toHaveBeenCalledWith("get_uncommitted_diff", {
      worktreePath: "/repo",
      filePath: "file.ts",
      isStaged: false,
      includeContent: false,
    });
  });

  test("reuses renderer work only for the same diff response", () => {
    const first = {
      path: "file.ts",
      patch: "@@ -1 +1 @@\n-old\n+new",
      old_content: null,
      new_content: null,
      worktree_content: null,
      is_binary: false,
    };
    const refreshed = { ...first };

    expect(getGitFileDiffRendererKey("request", first)).toBe(
      getGitFileDiffRendererKey("request", first),
    );
    expect(getGitFileDiffRendererKey("request", refreshed)).not.toBe(
      getGitFileDiffRendererKey("request", first),
    );

    const largeDiff = { ...first, patch: "x".repeat(4_000_000) };
    expect(getGitFileDiffRendererKey("request", largeDiff).length).toBeLessThan(
      64,
    );
  });

  test("does not cache an invalidated in-flight response", async () => {
    const stale = {
      patch: "stale",
      old_content: null,
      new_content: null,
      worktree_content: null,
      is_binary: false,
    };
    const fresh = { ...stale, patch: "fresh" };
    let resolveStale: (data: typeof stale) => void = () => {};
    const staleResponse = new Promise<typeof stale>((resolve) => {
      resolveStale = resolve;
    });
    invoke.mockImplementationOnce(() => staleResponse);

    const staleRequest = loadGitFileDiff(
      "/race-repo",
      "file.ts",
      false,
      false,
    );
    invalidateGitFileDiffCache("/race-repo");
    invoke.mockImplementationOnce(async () => fresh);

    expect(
      await loadGitFileDiff("/race-repo", "file.ts", false, false),
    ).toBe(fresh);
    resolveStale(stale);
    await staleRequest;

    expect(
      await loadGitFileDiff("/race-repo", "file.ts", false, false),
    ).toBe(fresh);
  });

  test("notifies active previews when a worktree cache is invalidated", () => {
    const invalidatedWorktrees: string[] = [];
    const unsubscribe = subscribeToGitFileDiffInvalidation((worktreePath) => {
      invalidatedWorktrees.push(worktreePath);
    });

    invalidateGitFileDiffCache("/repo");
    unsubscribe();
    invalidateGitFileDiffCache("/repo");

    expect(invalidatedWorktrees).toEqual(["/repo"]);
  });
});
