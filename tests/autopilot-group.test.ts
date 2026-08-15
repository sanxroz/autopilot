import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  clearGroup,
  getGroupName,
  setGroup,
} from "../scripts/autopilot-group.mjs";

const AUTOPILOT = resolve(import.meta.dir, "..", "autopilot");

describe("autopilot group", () => {
  test("creates a one-session group", () => {
    expect(setGroup([], "/worktrees/alpha", "Timeout fix", () => "group-1")).toEqual([
      {
        id: "group-1",
        name: "Timeout fix",
        worktreePaths: ["/worktrees/alpha"],
      },
    ]);
  });

  test("moves a session between groups without deleting the old group", () => {
    const groups = [
      { id: "one", name: "Old", worktreePaths: ["/worktrees/alpha", "/worktrees/beta"] },
      { id: "two", name: "Timeout fix", worktreePaths: ["/worktrees/gamma"] },
    ];

    expect(setGroup(groups, "/worktrees/alpha", "Timeout fix")).toEqual([
      { id: "one", name: "Old", worktreePaths: ["/worktrees/beta"] },
      {
        id: "two",
        name: "Timeout fix",
        worktreePaths: ["/worktrees/gamma", "/worktrees/alpha"],
      },
    ]);
  });

  test("gets and clears the current assignment", () => {
    const groups = [
      { id: "one", name: "Timeout fix", worktreePaths: ["/worktrees/alpha"] },
    ];

    expect(getGroupName(groups, "/worktrees/alpha")).toBe("Timeout fix");
    expect(clearGroup(groups, "/worktrees/alpha")).toEqual([]);
  });

  test("merges duplicate group names into one deterministic group", () => {
    const groups = [
      { id: "one", name: "Timeout fix", worktreePaths: ["/worktrees/alpha"] },
      { id: "two", name: "Other", worktreePaths: ["/worktrees/beta"] },
      { id: "three", name: "Timeout fix", worktreePaths: ["/worktrees/gamma"] },
    ];

    expect(setGroup(groups, "/worktrees/beta", "Timeout fix")).toEqual([
      {
        id: "one",
        name: "Timeout fix",
        worktreePaths: ["/worktrees/alpha", "/worktrees/gamma", "/worktrees/beta"],
      },
    ]);
  });

  test("persists assignments across real CLI processes and linked worktrees", async () => {
    const fixturePath = mkdtempSync(join(tmpdir(), "autopilot-group-"));
    const repoPath = join(fixturePath, "repo");
    const alphaPath = join(fixturePath, "alpha");
    const betaPath = join(fixturePath, "beta");
    const settingsPath = join(fixturePath, "missing", "nested", "settings.json");
    const env = { ...process.env, AUTOPILOT_SETTINGS_PATH: settingsPath };
    const run = (args: string[]) =>
      execFileSync(AUTOPILOT, args, {
        encoding: "utf8",
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });

    try {
      execFileSync("git", ["init", "--quiet", repoPath]);
      execFileSync(
        "git",
        ["-C", repoPath, "-c", "user.name=Autopilot Test", "-c", "user.email=test@example.com", "commit", "--quiet", "--allow-empty", "-m", "initial"],
      );
      execFileSync("git", ["-C", repoPath, "worktree", "add", "--quiet", "-b", "alpha", alphaPath]);
      execFileSync("git", ["-C", repoPath, "worktree", "add", "--quiet", "-b", "beta", betaPath]);

      expect(run(["group", "get", "--worktree", alphaPath])).toBe("");

      const alpha = Bun.spawn([AUTOPILOT, "group", "set", "Timeout fix", "--worktree", alphaPath], { env });
      const beta = Bun.spawn([AUTOPILOT, "group", "set", "Timeout fix", "--worktree", betaPath], { env });
      expect(await alpha.exited).toBe(0);
      expect(await beta.exited).toBe(0);
      expect(run(["group", "get", "--worktree", alphaPath])).toBe("Timeout fix");
      expect(run(["group", "get", "--worktree", betaPath])).toBe("Timeout fix");

      run(["group", "set", "Checkout bug", "--worktree", alphaPath]);
      run(["group", "clear", "--worktree", betaPath]);
      expect(run(["group", "get", "--worktree", alphaPath])).toBe("Checkout bug");
      expect(run(["group", "get", "--worktree", betaPath])).toBe("");

      expect(() => run(["group", "set", "Main group", "--worktree", repoPath])).toThrow();
      expect(() => run(["group", "set", "   ", "--worktree", alphaPath])).toThrow();
      expect(() => run(["group", "get", "unexpected", "--worktree", alphaPath])).toThrow();
      expect(() => run(["group", "get", "--worktree"])).toThrow();

      writeFileSync(`${settingsPath}.lock`, "");
      const staleTime = new Date(Date.now() - 6000);
      utimesSync(`${settingsPath}.lock`, staleTime, staleTime);
      expect(() => run(["group", "get", "--worktree", alphaPath])).toThrow(
        /Stale empty Autopilot settings lock/,
      );

      const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
      const groups = Object.values(settings.sidebarGroupsByRepo).flat();
      expect(groups).toEqual([
        expect.objectContaining({
          name: "Checkout bug",
          worktreePaths: [realpathSync(alphaPath)],
        }),
      ]);
    } finally {
      rmSync(fixturePath, { recursive: true, force: true });
    }
  });
});
