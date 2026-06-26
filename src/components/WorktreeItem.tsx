import { memo } from "react";
import { CircleAlert, CircleCheck, GitBranch, Loader, Trash2 } from "lucide-react";
import type { ProcessStatus, DiffStats, AgentRunState } from "../types";
import type { PRStatus } from "../types/github";
import { cn } from "../utils/cn";

const PROCESS_STATUS_LABELS: Record<ProcessStatus, string> = {
  dev_server: "Dev server running",
  agent_running: "",
  none: "",
};

const PROCESS_STATUS_COLORS: Record<ProcessStatus, string | null> = {
  dev_server: "bg-semantic-success",
  agent_running: "bg-semantic-warning",
  none: null,
};

function getProcessStatusColor(status: ProcessStatus): string | null {
  return PROCESS_STATUS_COLORS[status] ?? null;
}

type StatusInfo = { label: string; colorClass: string } | null;
type AgentStatusDisplay = {
  label: string;
  colorClass: string;
  icon: 'spinner' | 'ready' | 'completed' | 'error';
  title?: string;
};

function getStatusInfo(prStatus: PRStatus | null): StatusInfo {
  if (!prStatus) return null;

  if (prStatus.merged) {
    return { label: "Merged", colorClass: "text-semantic-merged" };
  }

  if (prStatus.state === "closed") {
    return { label: "Closed", colorClass: "text-semantic-error" };
  }

  if (prStatus.mergeable === "CONFLICTING") {
    return { label: "Conflicts", colorClass: "text-semantic-error" };
  }

  if (prStatus.draft) {
    return { label: "Draft", colorClass: "text-tertiary" };
  }

  if (prStatus.checks_status === "failure") {
    return { label: "Checks failing", colorClass: "text-semantic-error" };
  }

  if (prStatus.checks_status === "pending") {
    return { label: "Checks running", colorClass: "text-semantic-warning" };
  }

  switch (prStatus.review_decision) {
    case "APPROVED":
      return { label: "Ready to merge", colorClass: "text-semantic-success" };
    case "CHANGES_REQUESTED":
      return { label: "Changes requested", colorClass: "text-semantic-warning" };
    default:
      return { label: "In review", colorClass: "text-semantic-info" };
  }
}

interface WorktreeItemProps {
  name: string;
  branch: string | null;
  lastModified: string | null;
  diffStats: DiffStats | undefined;
  prStatus: PRStatus | null;
  processStatus: ProcessStatus;
  agentRunState?: AgentRunState;
  isActive: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  className?: string;
}

function getAgentStatusDisplay(agentRunState: AgentRunState | undefined): AgentStatusDisplay | null {
  if (!agentRunState) return null;

  if (agentRunState.status === 'completed' && agentRunState.endedAt) {
    if (Date.now() - agentRunState.endedAt > 5000) {
      return null;
    }
  }

  switch (agentRunState.status) {
    case 'starting':
    case 'running':
      return {
        label: 'Agent running',
        colorClass: 'text-semantic-warning',
        icon: 'spinner',
        title: agentRunState.label,
      };
    case 'waiting_input':
      return {
        label: 'Waiting for input',
        colorClass: 'text-semantic-success',
        icon: 'ready',
        title: agentRunState.label,
      };
    case 'completed':
      return {
        label: 'Agent finished',
        colorClass: 'text-semantic-success',
        icon: 'completed',
        title: agentRunState.label,
      };
    case 'error':
      return {
        label: 'Agent error',
        colorClass: 'text-semantic-error',
        icon: 'error',
        title: agentRunState.error ?? agentRunState.label,
      };
    default:
      return null;
  }
}

function formatTimeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export const WorktreeItem = memo(function WorktreeItem({
  name,
  branch,
  lastModified,
  diffStats,
  prStatus,
  processStatus,
  agentRunState,
  isActive,
  onSelect,
  onDelete,
  className,
}: WorktreeItemProps) {
  const timeAgo = formatTimeAgo(lastModified);
  const additions = diffStats?.additions ?? 0;
  const deletions = diffStats?.deletions ?? 0;
  const hasStats = additions > 0 || deletions > 0;

  const statusInfo = getStatusInfo(prStatus);
  const processStatusColorClass = getProcessStatusColor(processStatus);
  const processStatusLabel = PROCESS_STATUS_LABELS[processStatus];
  const agentStatus = getAgentStatusDisplay(agentRunState);

  const fallbackProcessLabel = processStatusLabel || null;
  const secondaryStatusLabel = fallbackProcessLabel;
  const secondaryStatusClass = processStatus === 'agent_running' ? 'text-semantic-warning' : 'text-secondary';

  return (
    <div
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${branch || name} workspace${prStatus ? `, PR #${prStatus.number}` : ""}${isActive ? ", currently selected" : ""}`}
      className={cn(
        "group rounded-md pl-3 pr-1.5 py-2 cursor-pointer relative w-full transition-colors text-primary",
        isActive ? "bg-active" : "bg-transparent hover:bg-hover",
        className
      )}
    >
      <div className="flex flex-col gap-0.5 w-full relative min-w-0">
        <div className="flex items-center gap-2 w-full min-w-0">
          <div className="flex items-center justify-center flex-shrink-0">
            <GitBranch className={cn("w-3.5 h-3.5", statusInfo?.colorClass || "text-tertiary")} />
          </div>
          {agentStatus ? (
            <div className={cn("flex-shrink-0", agentStatus.colorClass)} title={agentStatus.title || agentStatus.label}>
              {agentStatus.icon === 'spinner' && <Loader className="w-3 h-3 animate-spin" />}
              {agentStatus.icon === 'ready' && <div className="w-2 h-2 rounded-full bg-semantic-success" />}
              {agentStatus.icon === 'completed' && <CircleCheck className="w-3 h-3" />}
              {agentStatus.icon === 'error' && <CircleAlert className="w-3 h-3" />}
            </div>
          ) : processStatusColorClass ? (
            <div
              className={cn("w-2 h-2 rounded-full flex-shrink-0", processStatusColorClass)}
              title={processStatusLabel}
            />
          ) : null}
          <div className="truncate min-w-0 font-medium text-sm flex-1 text-primary">
            {branch || name}
          </div>
          <div className="relative flex items-center gap-1.5">
            {!prStatus && hasStats && (
              <div className="flex items-center gap-1 font-mono font-medium flex-shrink-0 rounded-sm text-xs py-0.5 px-1 group-hover:opacity-0 transition-opacity">
                {additions > 0 && (
                  <span className="text-semantic-success">+{additions}</span>
                )}
                {deletions > 0 && (
                  <span className="text-semantic-error">-{deletions}</span>
                )}
              </div>
            )}
            <div className="absolute inset-y-0 right-0 flex items-center gap-2.5 invisible group-hover:visible">
              <div
                className={cn(
                  "absolute inset-y-0 -left-5 right-0 w-8 pointer-events-none",
                  isActive
                    ? "bg-gradient-to-r from-transparent to-bg-active"
                    : "bg-gradient-to-r from-transparent to-bg-hover"
                )}
              />

              <button
                onClick={onDelete}
                className="rounded-sm relative z-10 p-0.5 transition-colors text-secondary hover:text-semantic-error"
                title="Delete worktree"
                aria-label="Delete worktree"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
        <div className="text-xs pl-5 flex items-center gap-1 min-w-0 overflow-hidden whitespace-nowrap text-secondary">
          {prStatus && (
            <>
              <span className={statusInfo?.colorClass}>{statusInfo?.label}</span>
              <span className="font-mono text-xs font-bold">·</span>
              <span>PR #{prStatus.number}</span>
              <span className="font-mono text-xs font-bold">·</span>
            </>
          )}
          {secondaryStatusLabel && (
            <>
              <span className={cn('truncate', secondaryStatusClass)} title={agentStatus?.title || secondaryStatusLabel}>
                {secondaryStatusLabel}
              </span>
              <span className="font-mono text-xs font-bold">·</span>
            </>
          )}
          <span className="lowercase truncate">{name}</span>
          {!prStatus && timeAgo && (
            <>
              <span className="font-mono text-xs font-bold">·</span>
              <span className="truncate">{timeAgo}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
});
