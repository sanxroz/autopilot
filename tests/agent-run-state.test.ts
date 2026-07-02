import { describe, expect, test } from "bun:test";
import { reconcileAgentRunState } from "../src/store/agentRunState";
import type { AgentRunState } from "../src/types";

describe("agent run state reconciliation", () => {
  test("creates a running lifecycle state when polling detects an external agent", () => {
    const result = reconcileAgentRunState("/repo/worktree", "agent_running", undefined, 1000);

    expect(result).toEqual<AgentRunState>({
      worktreePath: "/repo/worktree",
      sessionId: "process-/repo/worktree",
      status: "running",
      startedAt: 1000,
      lastEventAt: 1000,
      label: "Agent process detected",
    });
  });

  test("marks an active lifecycle state completed when polling no longer sees the agent", () => {
    const result = reconcileAgentRunState(
      "/repo/worktree",
      "none",
      {
        worktreePath: "/repo/worktree",
        sessionId: "terminal-1",
        status: "running",
        startedAt: 1000,
        lastEventAt: 1100,
      },
      2000
    );

    expect(result?.status).toBe("completed");
    expect(result?.endedAt).toBe(2000);
  });

  test("replaces a completed lifecycle state when polling detects a new running process", () => {
    const result = reconcileAgentRunState(
      "/repo/worktree",
      "agent_running",
      {
        worktreePath: "/repo/worktree",
        sessionId: "terminal-1",
        status: "completed",
        startedAt: 1000,
        lastEventAt: 1500,
        endedAt: 1900,
      },
      2000
    );

    expect(result).toEqual<AgentRunState>({
      worktreePath: "/repo/worktree",
      sessionId: "process-/repo/worktree",
      status: "running",
      startedAt: 2000,
      lastEventAt: 2000,
      label: "Agent process detected",
    });
  });
});
