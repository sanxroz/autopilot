import { describe, expect, test } from "bun:test";
import type { Repository, WorktreeInfo } from "../src/types";
import {
  canStartSpaceDrag,
  findSpaceForWorktree,
  getSpaceActivity,
  ownsSpaceDrag,
  reorderSpacePaths,
  resolveActiveSpace,
} from "../src/lib/spaces";

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

  test("attention takes priority in the Space rail activity indicator", () => {
    expect(getSpaceActivity(["agent:running", "pr:attention"], [])).toBe(
      "attention",
    );
    expect(getSpaceActivity(["pr:checks"], [])).toBe("running");
    expect(getSpaceActivity(["pr:none"], ["dev_server"])).toBe("running");
    expect(getSpaceActivity(["pr:review", "pr:none"], ["none"])).toBeNull();
  });

  test("reorders a Space before or after another Space", () => {
    const paths = ["alpha", "beta", "gamma"];

    expect(reorderSpacePaths(paths, "gamma", "alpha", "before")).toEqual([
      "gamma",
      "alpha",
      "beta",
    ]);
    expect(reorderSpacePaths(paths, "alpha", "beta", "after")).toEqual([
      "beta",
      "alpha",
      "gamma",
    ]);
    expect(reorderSpacePaths(paths, "missing", "beta", "after")).toEqual(paths);
  });

  test("keeps a Space drag owned by its initiating primary pointer", () => {
    expect(canStartSpaceDrag({ button: 0, isPrimary: true }, false)).toBe(true);
    expect(canStartSpaceDrag({ button: 0, isPrimary: false }, false)).toBe(false);
    expect(canStartSpaceDrag({ button: 0, isPrimary: true }, true)).toBe(false);
    expect(ownsSpaceDrag(7, 7)).toBe(true);
    expect(ownsSpaceDrag(8, 7)).toBe(false);
  });
});
