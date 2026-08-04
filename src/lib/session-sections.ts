import type { AgentRunState, ProcessStatus } from "../types";
import type { PRStatus } from "../types/github";

export type SessionMode = "pr" | "agent";

export type PrSessionSection =
  | "pr:attention"
  | "pr:ready"
  | "pr:review"
  | "pr:none"
  | "pr:closed";

export type AgentSessionSection =
  | "agent:attention"
  | "agent:running"
  | "agent:none";

export type SessionSection = PrSessionSection | AgentSessionSection;

export function getPrSessionSection(
  prStatus: PRStatus | null,
): PrSessionSection {
  if (!prStatus) return "pr:none";
  if (
    prStatus.merged ||
    prStatus.state === "merged" ||
    prStatus.state === "closed"
  ) {
    return "pr:closed";
  }
  if (
    prStatus.mergeable === "CONFLICTING" ||
    prStatus.checks_status === "failure" ||
    prStatus.review_decision === "CHANGES_REQUESTED" ||
    prStatus.has_unresolved_review_threads
  ) {
    return "pr:attention";
  }
  if (prStatus.review_decision === "APPROVED") return "pr:ready";
  return "pr:review";
}

export function getAgentSessionSection(
  processStatus: ProcessStatus,
  agentRunState: AgentRunState | undefined,
): AgentSessionSection {
  if (
    agentRunState?.status === "waiting_input" ||
    agentRunState?.status === "completed" ||
    agentRunState?.status === "error"
  ) {
    return "agent:attention";
  }
  if (
    processStatus === "agent_running" ||
    agentRunState?.status === "starting" ||
    agentRunState?.status === "running"
  ) {
    return "agent:running";
  }
  return "agent:none";
}
