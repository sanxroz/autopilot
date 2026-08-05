import type { AgentRunState, ProcessStatus } from "../types";
import type { PRStatus } from "../types/github";
import { getPrSessionSection } from "./session-sections";

export interface SessionSearchStatus {
  label: string;
  tone: "muted" | "info" | "success" | "warning" | "error";
}

export function getSessionSearchStatuses(
  processStatus: ProcessStatus,
  agentRun: AgentRunState | undefined,
  prStatus: PRStatus | undefined,
): SessionSearchStatus[] {
  let activity: SessionSearchStatus;
  if (agentRun?.status === "error") {
    activity = { label: "Agent error", tone: "error" };
  } else if (agentRun?.status === "waiting_input") {
    activity = { label: "Waiting for input", tone: "warning" };
  } else if (agentRun?.status === "completed") {
    activity = { label: "Agent finished", tone: "info" };
  } else if (
    processStatus === "agent_running" ||
    agentRun?.status === "starting" ||
    agentRun?.status === "running"
  ) {
    activity = { label: "Agent running", tone: "success" };
  } else if (processStatus === "dev_server") {
    activity = { label: "Dev server", tone: "info" };
  } else {
    activity = { label: "Idle", tone: "muted" };
  }

  if (!prStatus) return [activity];
  const section = getPrSessionSection(prStatus);
  const pullRequest: SessionSearchStatus = section === "pr:attention"
    ? { label: "PR needs attention", tone: "error" }
    : section === "pr:ready"
      ? { label: "Ready to merge", tone: "success" }
      : section === "pr:review"
        ? { label: prStatus.draft ? "Draft PR" : "PR in review", tone: "info" }
        : section === "pr:closed"
          ? { label: prStatus.merged ? "Merged" : "PR closed", tone: "muted" }
          : { label: "No pull request", tone: "muted" };
  return [activity, pullRequest];
}
