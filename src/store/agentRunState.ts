import type { AgentRunState, ProcessStatus } from "../types";

export const AGENT_FINISHED_TTL_MS = 5000;

export function getNextAgentFinishedDeadline(
  agentRuns: Record<string, AgentRunState | undefined>
): number | undefined {
  let nextDeadline: number | undefined;

  for (const agentRun of Object.values(agentRuns)) {
    if (
      (agentRun?.status === "completed" || agentRun?.status === "error") &&
      agentRun.endedAt
    ) {
      const deadline = agentRun.endedAt + AGENT_FINISHED_TTL_MS;
      nextDeadline = nextDeadline === undefined ? deadline : Math.min(nextDeadline, deadline);
    }
  }

  return nextDeadline;
}

export function isAgentActiveStatus(status: AgentRunState["status"]): boolean {
  return status === "starting" || status === "running" || status === "waiting_input";
}

export function reconcileAgentRunState(
  worktreePath: string,
  processStatus: ProcessStatus,
  currentState: AgentRunState | undefined,
  now: number
): AgentRunState | undefined {
  if (processStatus === "agent_running") {
    if (currentState && isAgentActiveStatus(currentState.status)) {
      return currentState;
    }

    return {
      worktreePath,
      sessionId: `process-${worktreePath}`,
      status: "running",
      startedAt: now,
      lastEventAt: now,
      label: "Agent process detected",
    };
  }

  if (!currentState) return undefined;

  if (isAgentActiveStatus(currentState.status)) {
    return {
      ...currentState,
      status: "completed",
      lastEventAt: now,
      endedAt: now,
      label: "Agent process exited",
    };
  }

  if (
    (currentState.status === "completed" || currentState.status === "error") &&
    currentState.endedAt &&
    now - currentState.endedAt >= AGENT_FINISHED_TTL_MS
  ) {
    return undefined;
  }

  return currentState;
}
