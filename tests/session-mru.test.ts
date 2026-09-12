import { describe, expect, test } from "bun:test";
import {
  cycleItems,
  orderRecentSessions,
  pruneRecentWorktreePaths,
  recordRecentWorktreePath,
} from "../src/lib/session-navigation";

describe("recent worktree navigation", () => {
  test("pushes successful selections to the front, dedupes, and caps history", () => {
    const paths = Array.from({ length: 10 }, (_, index) => `/worktree-${index}`);
    expect(recordRecentWorktreePath(paths, "/worktree-4")).toEqual([
      "/worktree-4",
      ...paths.filter((path) => path !== "/worktree-4"),
    ]);
    expect(recordRecentWorktreePath(paths, "/new-worktree")).toHaveLength(10);
  });

  test("prunes deleted paths and cycles in MRU order", () => {
    const sessions = [
      { path: "/one" },
      { path: "/two" },
      { path: "/three" },
    ];
    expect(pruneRecentWorktreePaths(["/two", "/gone", "/two", "/one"], new Set(["/one", "/two"])))
      .toEqual(["/two", "/one"]);
    expect(orderRecentSessions(sessions, ["/three", "/one"]).map(({ path }) => path))
      .toEqual(["/three", "/one", "/two"]);
  });

  test("keeps one traversal order while selections update MRU history", () => {
    const sessions = [{ path: "/one" }, { path: "/two" }, { path: "/three" }];
    const traversal = orderRecentSessions(sessions, sessions.map(({ path }) => path));
    let current = traversal[0];

    current = cycleItems(traversal, current, 1)!;
    expect(current.path).toBe("/two");
    expect(recordRecentWorktreePath(traversal.map(({ path }) => path), current.path)).toEqual([
      "/two", "/one", "/three",
    ]);
    current = cycleItems(traversal, current, 1)!;
    expect(current.path).toBe("/three");
  });
});
