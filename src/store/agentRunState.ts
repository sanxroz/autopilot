import { AI_AGENTS, type AgentRunState, type AgentStatusEvent, type ProcessStatus } from "../types";

export const AGENT_FINISHED_TTL_MS = 30 * 1000;

const KNOWN_AGENTS = new Set<string>(AI_AGENTS.map(({ id }) => id));

export function applyAgentStatusEvent(
  current: AgentRunState | undefined,
  event: AgentStatusEvent,
): AgentRunState | undefined {
  const timestamp = event.timestamp;
  const isNewSession = !current || current.sessionId !== event.sessionId;
  const isProcessOnlyState = current?.sessionId === `process-${event.worktreePath}`;

  if (
    current &&
    !isProcessOnlyState &&
    timestamp <= current.lastEventAt
  ) {
    return current;
  }

  const agent = event.agent && KNOWN_AGENTS.has(event.agent)
    ? event.agent as AgentRunState["agent"]
    : isNewSession ? undefined : current?.agent;

  return {
    worktreePath: event.worktreePath,
    sessionId: event.sessionId,
    terminalId: event.terminalId ?? (isNewSession ? undefined : current?.terminalId),
    status: event.status,
    startedAt: isNewSession ? timestamp : (current?.startedAt ?? timestamp),
    lastEventAt: timestamp,
    agent,
    label: event.message,
    error: event.status === "error" ? event.message ?? (isNewSession ? undefined : current?.error) : undefined,
    endedAt: event.status === "completed" || event.status === "error" ? timestamp : undefined,
  };
}

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
