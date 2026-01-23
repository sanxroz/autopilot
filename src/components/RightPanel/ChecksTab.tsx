import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Check,
  X,
  CircleDashed,
  ExternalLink,
  Loader,
  Circle,
} from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import { useAppStore } from "../../store";
import type { PRChecksResult, PRDetailedInfo, PRStatus } from "../../types/github";

interface ChecksTabProps {
  repoPath: string | null;
  prNumber: number | null;
  prUrl: string | null;
  prStatus: PRStatus | null;
}

function getCheckIcon(status: string, conclusion: string | null) {
  if (status !== "completed") {
    return CircleDashed;
  }
  if (conclusion === "success") {
    return Check;
  }
  if (conclusion === "failure" || conclusion === "cancelled") {
    return X;
  }
  return Circle;
}

function getCheckColor(status: string, conclusion: string | null, theme: ReturnType<typeof useTheme>) {
  if (status !== "completed") {
    return theme.semantic.warning;
  }
  if (conclusion === "success") {
    return theme.semantic.success;
  }
  if (conclusion === "failure" || conclusion === "cancelled") {
    return theme.semantic.error;
  }
  return theme.text.tertiary;
}

function formatDuration(
  startedAt: string | null,
  completedAt: string | null,
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

function getMergeStatusColor(status: string, theme: ReturnType<typeof useTheme>): string {
  switch (status) {
    case "CLEAN":
      return theme.semantic.success;
    case "UNSTABLE":
    case "BEHIND":
      return theme.semantic.warning;
    case "DIRTY":
    case "BLOCKED":
      return theme.semantic.error;
    default:
      return theme.text.tertiary;
  }
}

export function ChecksTab({
  repoPath,
  prNumber,
  prUrl,
  prStatus,
}: ChecksTabProps) {
  const theme = useTheme();
  const getPRDataCache = useAppStore((state) => state.getPRDataCache);
  const setPRDataCache = useAppStore((state) => state.setPRDataCache);
  
  const [checksResult, setChecksResult] = useState<PRChecksResult | null>(null);
  const [prDetails, setPrDetails] = useState<PRDetailedInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastPrStatusRef = useRef<PRStatus | null>(null);

  const fetchData = useCallback(async (isPolling = false) => {
    if (!repoPath || !prNumber) {
      setChecksResult(null);
      setPrDetails(null);
      return;
    }

    if (!isPolling) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const [checks, details] = await Promise.all([
        invoke<PRChecksResult>("get_pr_checks", { repoPath, prNumber }),
        invoke<PRDetailedInfo>("get_pr_details", { repoPath, prNumber }),
      ]);
      setChecksResult(checks);
      setPrDetails(details);
      setPRDataCache(repoPath, prNumber, { checksResult: checks, prDetails: details });
      if (isPolling) {
        setError(null);
      }
    } catch (e) {
      if (!isPolling) {
        setError(String(e));
        setChecksResult(null);
        setPrDetails(null);
      }
    } finally {
      if (!isPolling) {
        setIsLoading(false);
      }
    }
  }, [repoPath, prNumber, setPRDataCache]);

  useEffect(() => {
    if (!repoPath || !prNumber) return;
    
    const cached = getPRDataCache(repoPath, prNumber);
    if (cached?.checksResult && cached?.prDetails) {
      setChecksResult(cached.checksResult);
      setPrDetails(cached.prDetails);
      setError(null);
    } else {
      fetchData();
    }
  }, [repoPath, prNumber, getPRDataCache, fetchData]);

  useEffect(() => {
    if (!prStatus) return;
    
    const prev = lastPrStatusRef.current;
    const hasChanged = !prev || 
      prStatus.checks_status !== prev.checks_status ||
      prStatus.review_decision !== prev.review_decision ||
      prStatus.state !== prev.state ||
      prStatus.merged !== prev.merged ||
      prStatus.draft !== prev.draft;
    
    if (hasChanged) {
      lastPrStatusRef.current = prStatus;
      fetchData(true);
    }
  }, [prStatus, fetchData]);

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
        <Loader className="w-3.5 h-3.5 animate-spin mr-2" />
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
          onClick={() => fetchData()}
          className="px-3 py-1 rounded text-xs"
          style={{ background: theme.bg.tertiary, color: theme.text.primary }}
        >
          Retry
        </button>
      </div>
    );
  }

  const deployments =
    checksResult?.checks.filter(
      (c) =>
        c.name.toLowerCase().includes("vercel") ||
        c.name.toLowerCase().includes("deploy") ||
        c.name.toLowerCase().includes("preview"),
    ) || [];

  const regularChecks =
    checksResult?.checks.filter(
      (c) =>
        !c.name.toLowerCase().includes("vercel") &&
        !c.name.toLowerCase().includes("deploy") &&
        !c.name.toLowerCase().includes("preview"),
    ) || [];

  return (
    <div className="flex flex-col h-full overflow-auto">
      {prDetails && (
        <div
          className="px-3 py-3"
          style={{ borderColor: theme.border.default }}
        >
          <div
            className="text-xs font-medium mb-2"
            style={{ color: theme.text.tertiary }}
          >
            Git status
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Circle
                className="w-3.5 h-3.5"
                style={{
                  color: getMergeStatusColor(prDetails.merge_state_status, theme),
                }}
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
        <div
          className="px-3 py-3"
          style={{ borderColor: theme.border.default }}
        >
          <div
            className="text-xs font-medium mb-2"
            style={{ color: theme.text.tertiary }}
          >
            Deployments
          </div>
          {deployments.map((check, index) => {
            const Icon = getCheckIcon(check.status, check.conclusion);
            const color = getCheckColor(check.status, check.conclusion, theme);

            return (
              <div key={index} className="flex items-center gap-2 py-1.5">
                <Icon
                  className="w-3.5 h-3.5 flex-shrink-0"
                  style={{ color }}
                />
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
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {regularChecks.length > 0 && (
        <div
          className="px-3 py-3"
          style={{ borderColor: theme.border.default }}
        >
          <div
            className="text-xs font-medium mb-2"
            style={{ color: theme.text.tertiary }}
          >
            Checks
          </div>
          {regularChecks.map((check, index) => {
            const Icon = getCheckIcon(check.status, check.conclusion);
            const color = getCheckColor(check.status, check.conclusion, theme);
            const duration = formatDuration(
              check.started_at,
              check.completed_at,
            );

            return (
              <div key={index} className="flex items-center gap-2 py-1.5">
                <Icon
                  className="w-3.5 h-3.5 flex-shrink-0"
                  style={{ color }}
                />
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
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(!checksResult || checksResult.checks.length === 0) && (
        <div
          className="flex-1 flex items-center justify-center text-sm"
          style={{ color: theme.text.secondary }}
        >
          No checks
        </div>
      )}
    </div>
  );
}
