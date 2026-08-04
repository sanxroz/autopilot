import type { AgentRunState, ProcessStatus } from "../types";

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

  return currentState;
}
