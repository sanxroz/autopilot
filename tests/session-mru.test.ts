import { describe, expect, test } from "bun:test";
import {
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
});
