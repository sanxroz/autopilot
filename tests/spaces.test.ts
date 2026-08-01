import { describe, expect, test } from "bun:test";
import type { Repository, WorktreeInfo } from "../src/types";
import { findSpaceForWorktree, resolveActiveSpace } from "../src/lib/spaces";

const worktree = (name: string, path: string): WorktreeInfo => ({
  name,
  path,
  branch: name,
  last_modified: null,
});

const repository = (name: string, path: string, worktrees: WorktreeInfo[]): Repository => ({
  info: { name, path },
  worktrees,
  isExpanded: true,
});

describe("Spaces", () => {
  const alphaWorktree = worktree("alpha-task", "/repos/alpha-task");
  const betaWorktree = worktree("beta-task", "/repos/beta-task");
  const repositories = [
    repository("alpha", "/repos/alpha", [alphaWorktree]),
    repository("beta", "/repos/beta", [betaWorktree]),
  ];

  test("the selected session owns the active Space", () => {
    expect(findSpaceForWorktree(repositories, betaWorktree)).toBe("/repos/beta");
    expect(resolveActiveSpace(repositories, betaWorktree, "/repos/alpha")).toBe(
      "/repos/beta",
    );
  });

  test("a saved Space is restored before falling back to the first repository", () => {
    expect(resolveActiveSpace(repositories, null, "/repos/beta")).toBe("/repos/beta");
    expect(resolveActiveSpace(repositories, null, "/missing")).toBe("/repos/alpha");
  });

  test("an empty repository list has no active Space", () => {
    expect(resolveActiveSpace([], null, "/repos/alpha")).toBeNull();
  });
});
