import { describe, expect, test } from "bun:test";
import { getSidebarActivityLabel, getWorktreeActivityDisplay } from "../src/lib/worktree-status";
import type { AgentRunState } from "../src/types";

const run: AgentRunState = {
  worktreePath: "/repo/worktree",
  sessionId: "session-1",
  status: "running",
  startedAt: 1000,
  lastEventAt: 60_000,
};

describe("worktree activity display", () => {
  test("uses lifecycle state before process fallback", () => {
    expect(getWorktreeActivityDisplay({ ...run, status: "error", error: "Boom" }, "agent_running", 180_000)).toMatchObject({
      label: "Agent error",
      icon: "error",
      title: "Boom · 2m ago",
    });
    expect(getWorktreeActivityDisplay({ ...run, status: "waiting_input" }, "none", 60_000)).toMatchObject({
      label: "Waiting for input",
      colorClass: "text-semantic-warning",
      icon: "ready",
    });
    expect(getWorktreeActivityDisplay({ ...run, status: "completed" }, "none", 60_000)).toMatchObject({
      label: "Agent finished",
      icon: "completed",
    });
  });

  test("always labels a polled agent", () => {
    expect(getWorktreeActivityDisplay(undefined, "agent_running")).toMatchObject({
      label: "Agent open",
      icon: "dot",
    });
    expect(getWorktreeActivityDisplay({
      ...run,
      sessionId: `process-${run.worktreePath}`,
      label: "Agent process detected",
    }, "agent_running")).toMatchObject({
      label: "Agent open",
      icon: "dot",
    });
    expect(getWorktreeActivityDisplay(undefined, "none")).toBeNull();
  });

  test("hides activity text when pull request status already occupies the row", () => {
    const activity = getWorktreeActivityDisplay(run, "agent_running", 60_000);
    expect(getSidebarActivityLabel(activity, true)).toBeNull();
    expect(getSidebarActivityLabel(activity, false)).toBe("Agent running");
  });
});
