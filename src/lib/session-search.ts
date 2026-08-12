import type { AgentRunState, ProcessStatus } from "../types";
import type { PRStatus } from "../types/github";
import { getPrSessionSection } from "./session-sections";

export interface SessionSearchStatus {
  label: string;
  tone: "muted" | "info" | "success" | "warning" | "error";
}

export type SessionSearchFilter =
  | "attention"
  | "waiting"
  | "failed"
  | "ready"
  | "running"
  | "checks";

export interface SessionSearchCommand {
  filter: SessionSearchFilter;
  label: string;
  description: string;
}

export const SESSION_SEARCH_COMMANDS: readonly SessionSearchCommand[] = [
  { filter: "attention", label: "Needs attention", description: "Waiting, failed, finished, or ready to merge" },
  { filter: "waiting", label: "Waiting for input", description: "Agents blocked on you" },
  { filter: "failed", label: "Failed", description: "Agent or pull request failures" },
  { filter: "ready", label: "Ready", description: "Approved pull requests with passing checks" },
  { filter: "running", label: "Running", description: "Active agents and development servers" },
  { filter: "checks", label: "Checks running", description: "Pull requests with pending checks" },
];

export function getSessionSearchCommands(query: string): readonly SessionSearchCommand[] {
  const normalizedQuery = query.toLowerCase();
  return SESSION_SEARCH_COMMANDS.filter(({ filter, label }) =>
    `${filter} ${label}`.toLowerCase().includes(normalizedQuery),
  );
}

export interface ParsedSessionSearch {
  filter: SessionSearchFilter | null;
  query: string;
  commandQuery: string | null;
}

export function parseSessionSearch(search: string): ParsedSessionSearch {
  const trimmed = search.trimStart();
  if (!trimmed.startsWith("/")) {
    return { filter: null, query: trimmed, commandQuery: null };
  }

  const [command = "", ...queryParts] = trimmed.slice(1).split(/\s+/);
  const filter = SESSION_SEARCH_COMMANDS.find(({ filter }) => filter === command)?.filter ?? null;
  return filter
    ? { filter, query: queryParts.join(" "), commandQuery: null }
    : { filter: null, query: "", commandQuery: command.toLowerCase() };
}

export function getSessionSearchFilters(
  processStatus: ProcessStatus,
  agentRun: AgentRunState | undefined,
  prStatus: PRStatus | undefined,
): Set<SessionSearchFilter> {
  const filters = new Set<SessionSearchFilter>();
  const agentFailed = agentRun?.status === "error";
  const agentWaiting = agentRun?.status === "waiting_input";
  const agentFinished = agentRun?.status === "completed";

  if (agentWaiting) filters.add("waiting");
  if (agentFailed) filters.add("failed");
  if (
    processStatus === "agent_running" ||
    processStatus === "dev_server" ||
    agentRun?.status === "starting" ||
    agentRun?.status === "running"
  ) {
    filters.add("running");
  }

  if (prStatus) {
    const section = getPrSessionSection(prStatus);
    if (section === "pr:attention") filters.add("failed");
    if (section === "pr:ready") filters.add("ready");
    if (section === "pr:checks") filters.add("checks");
  }

  if (agentWaiting || agentFailed || agentFinished || filters.has("failed") || filters.has("ready")) {
    filters.add("attention");
  }

  return filters;
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
      : section === "pr:checks"
        ? { label: "Checks running", tone: "warning" }
      : section === "pr:review"
        ? { label: prStatus.draft ? "Draft PR" : "PR in review", tone: "info" }
        : section === "pr:closed"
          ? { label: prStatus.merged ? "Merged" : "PR closed", tone: "muted" }
          : { label: "No pull request", tone: "muted" };
  return [activity, pullRequest];
}
