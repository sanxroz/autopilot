import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  RefreshCw,
  Circle,
} from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import type { PRChecksResult, PRDetailedInfo } from "../../types/github";

interface ChecksTabProps {
  repoPath: string | null;
  prNumber: number | null;
  prUrl: string | null;
}

function getCheckIcon(status: string, conclusion: string | null) {
  if (status !== "completed") {
    return Clock;
  }
  if (conclusion === "success") {
    return CheckCircle;
  }
  if (conclusion === "failure" || conclusion === "cancelled") {
    return XCircle;
  }
  return Circle;
}

function getCheckColor(status: string, conclusion: string | null) {
  if (status !== "completed") {
    return "#F59E0B";
  }
  if (conclusion === "success") {
    return "#22C55E";
  }
  if (conclusion === "failure" || conclusion === "cancelled") {
    return "#EF4444";
  }
  return "#6B7280";
}

function formatDuration(
  startedAt: string | null,
  completedAt: string | null
): string {
  if (!startedAt || !completedAt) return "";

  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  const durationMs = end - start;

  if (durationMs < 1000) return "0s";
  if (durationMs < 60000) return `${Math.round(durationMs / 1000)}s`;
  return `${Math.round(durationMs / 60000)}m`;
}

function getMergeStatusText(status: string): string {
  switch (status) {
    case "CLEAN":
      return "Ready to merge";
    case "UNSTABLE":
      return "Unstable";
    case "DIRTY":
      return "Merge conflicts";
    case "BLOCKED":
      return "Blocked";
    case "BEHIND":
      return "Behind base branch";
    case "HAS_HOOKS":
      return "Has hooks";
    default:
      return status;
  }
}

function getMergeStatusColor(status: string): string {
  switch (status) {
    case "CLEAN":
      return "#22C55E";
    case "UNSTABLE":
    case "BEHIND":
      return "#F59E0B";
    case "DIRTY":
    case "BLOCKED":
      return "#EF4444";
    default:
      return "#6B7280";
  }
}

export function ChecksTab({ repoPath, prNumber, prUrl }: ChecksTabProps) {
  const theme = useTheme();
  const [checksResult, setChecksResult] = useState<PRChecksResult | null>(null);
  const [prDetails, setPrDetails] = useState<PRDetailedInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!repoPath || !prNumber) {
      setChecksResult(null);
      setPrDetails(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [checks, details] = await Promise.all([
        invoke<PRChecksResult>("get_pr_checks", { repoPath, prNumber }),
        invoke<PRDetailedInfo>("get_pr_details", { repoPath, prNumber }),
      ]);
      setChecksResult(checks);
      setPrDetails(details);
    } catch (e) {
      setError(String(e));
      setChecksResult(null);
      setPrDetails(null);
    } finally {
      setIsLoading(false);
    }
  }, [repoPath, prNumber]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!prNumber) {
    return (
      <div
        className="flex-1 flex items-center justify-center text-sm"
        style={{ color: theme.text.secondary }}
      >
        No PR found for this branch
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="flex-1 flex items-center justify-center text-sm"
        style={{ color: theme.text.secondary }}
      >
        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center text-sm gap-2 p-4"
        style={{ color: theme.semantic.error }}
      >
        <span className="text-center">{error}</span>
        <button
          onClick={fetchData}
          className="px-3 py-1 rounded text-xs"
          style={{ background: theme.bg.tertiary, color: theme.text.primary }}
        >
          Retry
        </button>
      </div>
    );
  }

  const deployments = checksResult?.checks.filter(
    (c) =>
      c.name.toLowerCase().includes("vercel") ||
      c.name.toLowerCase().includes("deploy") ||
      c.name.toLowerCase().includes("preview")
  ) || [];

  const regularChecks = checksResult?.checks.filter(
    (c) =>
      !c.name.toLowerCase().includes("vercel") &&
      !c.name.toLowerCase().includes("deploy") &&
      !c.name.toLowerCase().includes("preview")
  ) || [];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div
        className="px-3 py-1.5 flex items-center justify-end border-b"
        style={{ borderColor: theme.border.default }}
      >
        <button
          onClick={fetchData}
          className="p-1 rounded transition-colors"
          style={{ color: theme.text.tertiary }}
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {prDetails && (
        <div className="px-3 py-3 border-b" style={{ borderColor: theme.border.default }}>
          <div
            className="text-xs font-medium mb-2"
            style={{ color: theme.text.tertiary }}
          >
            Git status
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Circle
                className="w-4 h-4"
                style={{ color: getMergeStatusColor(prDetails.merge_state_status) }}
              />
              <span className="text-sm" style={{ color: theme.text.primary }}>
                {getMergeStatusText(prDetails.merge_state_status)}
              </span>
            </div>
            {prDetails.merge_state_status === "CLEAN" && prUrl && (
              <button
                onClick={() => window.open(prUrl, "_blank")}
                className="text-xs px-2 py-1 rounded transition-colors"
                style={{ color: theme.text.secondary }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = theme.bg.hover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                Merge
              </button>
            )}
          </div>
        </div>
      )}

      {deployments.length > 0 && (
        <div className="px-3 py-3 border-b" style={{ borderColor: theme.border.default }}>
          <div
            className="text-xs font-medium mb-2"
            style={{ color: theme.text.tertiary }}
          >
            Deployments
          </div>
          {deployments.map((check, index) => {
            const Icon = getCheckIcon(check.status, check.conclusion);
            const color = getCheckColor(check.status, check.conclusion);

            return (
              <div
                key={index}
                className="flex items-center gap-2 py-1.5"
              >
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />
                <span
                  className="flex-1 text-sm truncate"
                  style={{ color: theme.text.primary }}
                >
                  {check.name}
                </span>
                {check.url && (
                  <a
                    href={check.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded transition-colors flex-shrink-0"
                    style={{ color: theme.text.tertiary }}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {regularChecks.length > 0 && (
        <div className="px-3 py-3 border-b" style={{ borderColor: theme.border.default }}>
          <div
            className="text-xs font-medium mb-2"
            style={{ color: theme.text.tertiary }}
          >
            Checks
          </div>
          {regularChecks.map((check, index) => {
            const Icon = getCheckIcon(check.status, check.conclusion);
            const color = getCheckColor(check.status, check.conclusion);
            const duration = formatDuration(check.started_at, check.completed_at);

            return (
              <div
                key={index}
                className="flex items-center gap-2 py-1.5"
              >
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />
                <span
                  className="flex-1 text-sm truncate"
                  style={{ color: theme.text.primary }}
                >
                  {check.name}
                </span>
                {duration && (
                  <span
                    className="text-xs flex-shrink-0"
                    style={{ color: theme.text.tertiary }}
                  >
                    {duration}
                  </span>
                )}
                {check.url && (
                  <a
                    href={check.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded transition-colors flex-shrink-0"
                    style={{ color: theme.text.tertiary }}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {prDetails && prDetails.comments.length > 0 && (
        <div className="px-3 py-3">
          <div className="flex items-center justify-between mb-2">
            <div
              className="text-xs font-medium"
              style={{ color: theme.text.tertiary }}
            >
              Comments
            </div>
          </div>
          {prDetails.comments.slice(0, 5).map((comment, index) => (
            <div
              key={index}
              className="flex items-start gap-2 py-2 border-b last:border-b-0"
              style={{ borderColor: theme.border.subtle }}
            >
              <Circle className="w-3 h-3 mt-1 flex-shrink-0" style={{ color: theme.text.tertiary }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-medium"
                    style={{ color: theme.text.primary }}
                  >
                    {comment.author}
                  </span>
                </div>
                <p
                  className="text-xs mt-0.5 line-clamp-2"
                  style={{ color: theme.text.secondary }}
                >
                  {comment.body}
                </p>
              </div>
            </div>
          ))}
          {prDetails.comments.length > 5 && (
            <div
              className="text-xs mt-2 text-center"
              style={{ color: theme.text.tertiary }}
            >
              +{prDetails.comments.length - 5} more comments
            </div>
          )}
        </div>
      )}

      {(!checksResult || checksResult.checks.length === 0) &&
        (!prDetails || prDetails.comments.length === 0) && (
          <div
            className="flex-1 flex items-center justify-center text-sm"
            style={{ color: theme.text.secondary }}
          >
            No checks or comments
          </div>
        )}
    </div>
  );
}
