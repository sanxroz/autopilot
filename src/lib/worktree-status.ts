import type { AgentRunState, ProcessStatus } from "../types";

export type WorktreeActivityDisplay = {
  label: string;
  colorClass: string;
  icon: "spinner" | "ready" | "completed" | "error" | "dot";
  title: string;
};

export function getSidebarActivityLabel(
  activity: WorktreeActivityDisplay | null,
  hasPullRequest: boolean,
): string | null {
  return hasPullRequest ? null : activity?.label ?? null;
}

function formatEventAge(timestamp: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export function getWorktreeActivityDisplay(
  agentRunState: AgentRunState | undefined,
  processStatus: ProcessStatus,
  now = Date.now(),
): WorktreeActivityDisplay | null {
  if (agentRunState) {
    const detail = agentRunState.error ?? agentRunState.label;
    const title = [detail, formatEventAge(agentRunState.lastEventAt, now)].filter(Boolean).join(" · ");
    const isProcessOnly = agentRunState.sessionId === `process-${agentRunState.worktreePath}`;

    switch (agentRunState.status) {
      case "starting":
      case "running":
        if (isProcessOnly) {
          return { label: "Agent open", colorClass: "text-semantic-warning", icon: "dot", title };
        }
        return { label: "Agent running", colorClass: "text-semantic-warning", icon: "spinner", title };
      case "waiting_input":
        return { label: "Waiting for input", colorClass: "text-semantic-warning", icon: "ready", title };
      case "completed":
        return { label: "Agent finished", colorClass: "text-semantic-success", icon: "completed", title };
      case "error":
        return { label: "Agent error", colorClass: "text-semantic-error", icon: "error", title };
      default:
        break;
    }
  }

  if (processStatus === "agent_running") {
    return {
      label: "Agent open",
      colorClass: "text-semantic-warning",
      icon: "dot",
      title: "Agent process detected",
    };
  }

  return null;
}
