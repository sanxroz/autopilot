import { describe, expect, test } from "bun:test";
import {
  cycleItems,
  getNavigableSessions,
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
});
