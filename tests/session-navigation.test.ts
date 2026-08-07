import { describe, expect, test } from "bun:test";
import {
  cycleItems,
  getNavigableSessions,
  orderSessionsByPath,
} from "../src/lib/session-navigation";

describe("session navigation", () => {
  test("excludes hidden main worktrees", () => {
    const sessions = getNavigableSessions([
      { worktrees: [{ name: "main" }, { name: "feature-one" }] },
      { worktrees: [{ name: "feature-two" }] },
    ]);

    expect(sessions.map(({ name }) => name)).toEqual([
      "feature-one",
      "feature-two",
    ]);
  });

  test("wraps in either direction", () => {
    const sessions = ["one", "two", "three"];

    expect(cycleItems(sessions, "three", 1)).toBe("one");
    expect(cycleItems(sessions, "one", -1)).toBe("three");
  });

  test("matches the rendered sidebar order", () => {
    const sessions = [
      { name: "one", path: "/one" },
      { name: "two", path: "/two" },
      { name: "three", path: "/three" },
    ];

    expect(orderSessionsByPath(sessions, ["/three", "/one"])).toEqual([
      sessions[2],
      sessions[0],
    ]);
  });
});
