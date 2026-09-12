import { describe, expect, test } from "bun:test";
import {
  AGENT_FINISHED_TTL_MS,
  applyAgentStatusEvent,
  getNextAgentFinishedDeadline,
  reconcileAgentRunState,
} from "../src/store/agentRunState";
import type { AgentRunState } from "../src/types";

describe("agent run state reconciliation", () => {
  test("uses a 30 minute finished-state display window", () => {
    expect(AGENT_FINISHED_TTL_MS).toBe(30 * 60 * 1000);
  });

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

  test("preserves waiting input while polling still detects the agent", () => {
    const waiting: AgentRunState = {
      worktreePath: "/repo/worktree",
      sessionId: "terminal-1",
      status: "waiting_input",
      startedAt: 1000,
      lastEventAt: 1100,
    };

    expect(reconcileAgentRunState("/repo/worktree", "agent_running", waiting, 2000)).toBe(waiting);
    expect(reconcileAgentRunState("/repo/worktree", "none", waiting, 2000)?.status).toBe("completed");
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

  test("clears a finished run after its display window", () => {
    const completed: AgentRunState = {
      worktreePath: "/repo/worktree",
      sessionId: "terminal-1",
      status: "completed",
      startedAt: 1000,
      lastEventAt: 1500,
      endedAt: 1500,
    };

    expect(
      reconcileAgentRunState(
        "/repo/worktree",
        "none",
        completed,
        completed.endedAt! + AGENT_FINISHED_TTL_MS,
      ),
    ).toBeUndefined();
  });

  test("keeps a finished run visible during its display window", () => {
    const completed: AgentRunState = {
      worktreePath: "/repo/worktree",
      sessionId: "terminal-1",
      status: "completed",
      startedAt: 1000,
      lastEventAt: 1500,
      endedAt: 1500,
    };

    expect(
      reconcileAgentRunState(
        "/repo/worktree",
        "none",
        completed,
        completed.endedAt! + AGENT_FINISHED_TTL_MS - 1,
      ),
    ).toBe(completed);
  });

  test("returns the earliest finished-state cleanup deadline", () => {
    expect(
      getNextAgentFinishedDeadline({
        running: {
          worktreePath: "/repo/running",
          sessionId: "terminal-running",
          status: "running",
          startedAt: 1000,
          lastEventAt: 1000,
        },
        completed: {
          worktreePath: "/repo/completed",
          sessionId: "terminal-completed",
          status: "completed",
          startedAt: 1000,
          lastEventAt: 3000,
          endedAt: 3000,
        },
        error: {
          worktreePath: "/repo/error",
          sessionId: "terminal-error",
          status: "error",
          startedAt: 1000,
          lastEventAt: 2000,
          endedAt: 2000,
        },
      }),
    ).toBe(2000 + AGENT_FINISHED_TTL_MS);
  });

  test("accepts newer sessions and rejects older or ambiguous events", () => {
    const current: AgentRunState = {
      worktreePath: "/repo/worktree",
      sessionId: "session-1",
      terminalId: "terminal-1",
      status: "completed",
      startedAt: 1000,
      lastEventAt: 2000,
      endedAt: 2000,
      error: "old error",
    };

    expect(applyAgentStatusEvent(current, {
      worktreePath: current.worktreePath,
      sessionId: "session-2",
      status: "running",
      timestamp: 1999,
    })).toBe(current);
    expect(applyAgentStatusEvent(current, {
      worktreePath: current.worktreePath,
      sessionId: "session-2",
      status: "running",
      timestamp: 2000,
    })).toBe(current);

    expect(applyAgentStatusEvent(current, {
      worktreePath: current.worktreePath,
      sessionId: "session-2",
      terminalId: "terminal-2",
      status: "completed",
      timestamp: 2001,
      agent: "codex",
      message: "Finished quickly",
    })).toEqual({
      worktreePath: current.worktreePath,
      sessionId: "session-2",
      terminalId: "terminal-2",
      status: "completed",
      startedAt: 2001,
      lastEventAt: 2001,
      endedAt: 2001,
      agent: "codex",
      error: undefined,
      label: "Finished quickly",
    });
  });

  test("preserves a zero event timestamp", () => {
    expect(applyAgentStatusEvent(undefined, {
      worktreePath: "/repo/worktree",
      sessionId: "session-1",
      status: "running",
      timestamp: 0,
    })).toMatchObject({
      startedAt: 0,
      lastEventAt: 0,
    });
  });

  test("lets lifecycle events replace newer process-only observations", () => {
    const processOnly = reconcileAgentRunState(
      "/repo/worktree",
      "agent_running",
      undefined,
      2000,
    );

    expect(applyAgentStatusEvent(processOnly, {
      worktreePath: "/repo/worktree",
      sessionId: "session-1",
      status: "waiting_input",
      timestamp: 1999,
    })).toMatchObject({
      sessionId: "session-1",
      status: "waiting_input",
      lastEventAt: 1999,
    });
  });

  test("preserves same-session start time and drops delayed events", () => {
    const current: AgentRunState = {
      worktreePath: "/repo/worktree",
      sessionId: "session-1",
      terminalId: "terminal-1",
      status: "running",
      startedAt: 1000,
      lastEventAt: 1500,
      agent: "codex",
    };

    expect(applyAgentStatusEvent(current, {
      worktreePath: current.worktreePath,
      sessionId: current.sessionId,
      status: "waiting_input",
      timestamp: 1499,
    })).toBe(current);
    expect(applyAgentStatusEvent(current, {
      worktreePath: current.worktreePath,
      sessionId: current.sessionId,
      status: "completed",
      timestamp: 1500,
    })).toBe(current);
    expect(applyAgentStatusEvent(current, {
      worktreePath: current.worktreePath,
      sessionId: current.sessionId,
      status: "error",
      timestamp: 1600,
      message: "Failed",
    })).toMatchObject({
      status: "error",
      startedAt: 1000,
      lastEventAt: 1600,
      endedAt: 1600,
      agent: "codex",
      error: "Failed",
    });
  });
});
