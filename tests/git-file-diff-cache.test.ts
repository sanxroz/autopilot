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
