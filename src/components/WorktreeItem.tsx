import { GitBranch, Trash2 } from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import { usePRStatusForBranch } from "../hooks/usePRStatus";
import { useAppStore } from "../store";
import type { WorktreeInfo, ProcessStatus } from "../types";
import type { PRStatus } from "../types/github";

const PROCESS_STATUS_COLORS: Record<ProcessStatus, string | null> = {
  dev_server: "#22C55E",
  agent_running: "#F59E0B",
  none: null,
};

const PROCESS_STATUS_LABELS: Record<ProcessStatus, string> = {
  dev_server: "Dev server running",
  agent_running: "AI agent running",
  none: "",
};

function getStatusInfo(prStatus: PRStatus | null): { label: string; color: string } | null {
  if (!prStatus) return null;

  if (prStatus.merged) {
    return { label: "Merged", color: "#A855F7" };
  }

  if (prStatus.state === "closed") {
    return { label: "Closed", color: "#EF4444" };
  }

  if (prStatus.draft) {
    return { label: "Draft", color: "#6B7280" };
  }

  if (prStatus.checks_status === "failure") {
    return { label: "Checks failing", color: "#EF4444" };
  }

  if (prStatus.checks_status === "pending") {
    return { label: "Checks running", color: "#F59E0B" };
  }

  switch (prStatus.review_decision) {
    case "APPROVED":
      return { label: "Ready to merge", color: "#22C55E" };
    case "CHANGES_REQUESTED":
      return { label: "Changes requested", color: "#F59E0B" };
    default:
      return { label: "In review", color: "#3B82F6" };
  }
}

interface WorktreeItemProps {
  worktree: WorktreeInfo;
  repoPath: string;
  isActive: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
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

export function WorktreeItem({
  worktree,
  repoPath,
  isActive,
  onSelect,
  onDelete,
}: WorktreeItemProps) {
  const theme = useTheme();
  const wt = worktree;
  const timeAgo = formatTimeAgo(wt.last_modified);
  const hasStats = wt.diff_stats && (wt.diff_stats.additions > 0 || wt.diff_stats.deletions > 0);

  const prStatus = usePRStatusForBranch(repoPath, wt.branch);
  const statusInfo = getStatusInfo(prStatus);
  const processStatus = useAppStore((state) => state.processStatusByPath[wt.path] || 'none');
  const processStatusColor = PROCESS_STATUS_COLORS[processStatus];
  const processStatusLabel = PROCESS_STATUS_LABELS[processStatus];

  return (
    <div
      onClick={onSelect}
      className="group rounded-md pl-3 pr-1.5 py-2 cursor-pointer relative w-full transition-colors"
      style={{
        background: isActive ? theme.bg.active : "transparent",
        color: theme.text.primary,
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = theme.bg.hover;
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      <div className="flex flex-col gap-0.5 w-full relative min-w-0">
        <div className="flex items-center gap-2 w-full min-w-0">
          <div className="flex items-center justify-center flex-shrink-0">
            <GitBranch className="w-3 h-3" style={{ color: statusInfo?.color || theme.text.tertiary }} />
          </div>
          {processStatusColor && (
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: processStatusColor }}
              title={processStatusLabel}
            />
          )}
          <div
            className="truncate min-w-0 font-medium text-sm flex-1"
            style={{ color: theme.text.primary }}
          >
            {wt.branch || wt.name}
          </div>
          <div className="relative flex items-center gap-1.5">
            {!prStatus && hasStats && (
              <div
                className="flex items-center gap-1 font-mono font-medium flex-shrink-0 rounded-sm text-xs py-0.5 px-1 group-hover:opacity-0 transition-opacity"
              >
                {wt.diff_stats!.additions > 0 && (
                  <span style={{ color: "#22C55E" }}>+{wt.diff_stats!.additions}</span>
                )}
                {wt.diff_stats!.deletions > 0 && (
                  <span style={{ color: "#EF4444" }}>-{wt.diff_stats!.deletions}</span>
                )}
              </div>
            )}
            <div className="absolute inset-y-0 right-0 flex items-center gap-2.5 invisible group-hover:visible">
              <div
                className="absolute inset-y-0 -left-5 right-0 w-8 pointer-events-none"
                style={{
                  background: `linear-gradient(to right, transparent, ${isActive ? theme.bg.active : theme.bg.hover})`,
                }}
              />

              <button
                onClick={onDelete}
                className="rounded-sm relative z-10 p-0.5 transition-colors"
                style={{ color: theme.text.secondary }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = theme.semantic.error;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = theme.text.secondary;
                }}
                title="Delete worktree"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
        <div
          className="text-xs pl-5 flex items-center gap-1 min-w-0 overflow-hidden whitespace-nowrap"
          style={{ color: theme.text.secondary }}
        >
          {prStatus && (
            <>
              <span style={{ color: statusInfo?.color }}>{statusInfo?.label}</span>
              <span className="font-mono text-xs font-bold">·</span>
              <span>PR #{prStatus.number}</span>
              <span className="font-mono text-xs font-bold">·</span>
            </>
          )}
          <span className="lowercase truncate">{wt.name}</span>
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
}
