import { describe, expect, test } from "bun:test";
import {
  addWorktreeSetupName,
  isWorktreeSettingUp,
  removeWorktreeSetupName,
} from "../src/store/worktreeSetup";

describe("worktree setup tracking", () => {
  test("tracks multiple worktrees per repo without clobbering existing ones", () => {
    const afterFirst = addWorktreeSetupName({}, "/repo", "alpha");
    const afterSecond = addWorktreeSetupName(afterFirst, "/repo", "beta");

    expect(isWorktreeSettingUp(afterSecond, "/repo", "alpha")).toBe(true);
    expect(isWorktreeSettingUp(afterSecond, "/repo", "beta")).toBe(true);
    expect(afterSecond["/repo"]).toEqual(["alpha", "beta"]);
  });

  test("removes only the finished worktree and clears the repo entry when empty", () => {
    const start = {
      "/repo": ["alpha", "beta"],
    };

    const afterFirst = removeWorktreeSetupName(start, "/repo", "alpha");
    expect(afterFirst["/repo"]).toEqual(["beta"]);

    const afterSecond = removeWorktreeSetupName(afterFirst, "/repo", "beta");
    expect(afterSecond["/repo"]).toBeUndefined();
  });
});
