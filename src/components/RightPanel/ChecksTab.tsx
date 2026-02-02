import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  Check,
  X,
  ExternalLink,
  Loader,
  Circle,
} from "lucide-react";
import { useAppStore } from "../../store";
import { cn } from "../../utils/cn";
import type { PRChecksResult, PRDetailedInfo, PRStatus } from "../../types/github";

interface ChecksTabProps {
  repoPath: string | null;
  prNumber: number | null;
  prStatus: PRStatus | null;
}

function getCheckIcon(status: string, conclusion: string | null) {
  if (status !== "completed") {
    return Loader;
  }
  if (conclusion === "success") {
    return Check;
  }
  if (conclusion === "failure" || conclusion === "cancelled") {
    return X;
  }
  return Circle;
}

function getCheckColorClass(status: string, conclusion: string | null): string {
  if (status !== "completed") {
    return "text-semantic-warning";
  }
  if (conclusion === "success") {
    return "text-semantic-success";
  }
  if (conclusion === "failure" || conclusion === "cancelled") {
    return "text-semantic-error";
  }
  return "text-tertiary";
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

function getMergeStatusColorClass(status: string): string {
  switch (status) {
    case "CLEAN":
      return "text-semantic-success";
    case "UNSTABLE":
    case "BEHIND":
      return "text-semantic-warning";
    case "DIRTY":
    case "BLOCKED":
      return "text-semantic-error";
    default:
      return "text-tertiary";
  }
}

export function ChecksTab({
  repoPath,
  prNumber,
  prStatus,
}: ChecksTabProps) {
  const getPRDataCache = useAppStore((state) => state.getPRDataCache);
  const setPRDataCache = useAppStore((state) => state.setPRDataCache);
  const [isMerging, setIsMerging] = useState(false);
  const [hasMerged, setHasMerged] = useState(false);
  
  // Track the active PR to detect stale async callbacks
  const activePrRef = useRef<{ repoPath: string | null; prNumber: number | null }>({ 
    repoPath: null, 
    prNumber: null 
  });

  useEffect(() => {
    setHasMerged(false);
    setIsMerging(false);
    activePrRef.current = { repoPath, prNumber };
  }, [prNumber, repoPath]);
  
  // Initialize state from the cache (via a lazy initializer) to avoid the initial render
  // briefly showing "No checks" even when cached data exists.
  const [checksResult, setChecksResult] = useState<PRChecksResult | null>(() => {
    const cached = repoPath && prNumber ? getPRDataCache(repoPath, prNumber) : null;
    return cached?.checksResult ?? null;
  });
  const [prDetails, setPrDetails] = useState<PRDetailedInfo | null>(() => {
    const cached = repoPath && prNumber ? getPRDataCache(repoPath, prNumber) : null;
    return cached?.prDetails ?? null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastPrStatusRef = useRef<PRStatus | null>(null);
  const initialFetchDoneRef = useRef(false);

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
    initialFetchDoneRef.current = true;
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
      // Only fetch if initial load has completed (prevents double fetch on mount)
      if (initialFetchDoneRef.current) {
        fetchData(true);
      }
    }
  }, [prStatus, fetchData]);

  const handleMerge = useCallback(async () => {
    if (!repoPath || !prNumber) return;
    
    const mergeRepoPath = repoPath;
    const mergePrNumber = prNumber;
    
    setIsMerging(true);
    try {
      const result = await invoke<{ success: boolean; message: string }>("merge_pr", {
        repoPath: mergeRepoPath,
        prNumber: mergePrNumber,
      });
      
      const isStale = activePrRef.current.repoPath !== mergeRepoPath || 
                      activePrRef.current.prNumber !== mergePrNumber;
      if (isStale) return;
      
      if (result.success) {
        toast.success(`PR #${mergePrNumber} merged`);
        setHasMerged(true);
      } else {
        toast.error(result.message || "Merge failed");
      }
    } catch (e) {
      const isStale = activePrRef.current.repoPath !== mergeRepoPath || 
                      activePrRef.current.prNumber !== mergePrNumber;
      if (!isStale) {
        toast.error(String(e));
      }
    } finally {
      const isStale = activePrRef.current.repoPath !== mergeRepoPath || 
                      activePrRef.current.prNumber !== mergePrNumber;
      if (!isStale) {
        setIsMerging(false);
      }
    }
  }, [repoPath, prNumber]);

  if (!prNumber) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-secondary">
        No PR found for this branch
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-secondary">
        <Loader className="w-3.5 h-3.5 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-sm gap-2 p-4 text-semantic-error">
        <span className="text-center">{error}</span>
        <button
          onClick={() => fetchData()}
          className="px-3 py-1 rounded text-xs bg-tertiary text-primary"
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
        <div className="px-3 py-3 border-border">
          <div className="text-xs font-medium mb-2 text-tertiary">
            Git status
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Circle
                className={cn("w-3.5 h-3.5", getMergeStatusColorClass(prDetails.merge_state_status))}
              />
              <span className="text-sm text-primary">
                {getMergeStatusText(prDetails.merge_state_status)}
              </span>
            </div>
            {prDetails.merge_state_status === "CLEAN" && prNumber && !hasMerged && (
              <button
                onClick={handleMerge}
                disabled={isMerging}
                className="text-xs px-2 py-1 rounded transition-colors flex items-center gap-1 disabled:opacity-70 text-secondary hover:bg-hover"
              >
                {isMerging && <Loader className="w-3 h-3 animate-spin" />}
                {isMerging ? "Merging..." : "Merge"}
              </button>
            )}
          </div>
        </div>
      )}

      {deployments.length > 0 && (
        <div className="px-3 py-3 border-border">
          <div className="text-xs font-medium mb-2 text-tertiary">
            Deployments
          </div>
          {deployments.map((check, index) => {
            const Icon = getCheckIcon(check.status, check.conclusion);
            const colorClass = getCheckColorClass(check.status, check.conclusion);

            return (
              <div key={index} className="flex items-center gap-2 py-1.5">
                <Icon
                  className={cn("w-3.5 h-3.5 flex-shrink-0", colorClass, check.status !== "completed" && "animate-spin")}
                />
                <span className="flex-1 text-sm truncate text-primary">
                  {check.name}
                </span>
                {check.url && (
                  <a
                    href={check.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded transition-colors flex-shrink-0 text-tertiary"
                    aria-label={`Open ${check.name} in new tab`}
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
        <div className="px-3 py-3 border-border">
          <div className="text-xs font-medium mb-2 text-tertiary">
            Checks
          </div>
          {regularChecks.map((check, index) => {
            const Icon = getCheckIcon(check.status, check.conclusion);
            const colorClass = getCheckColorClass(check.status, check.conclusion);
            const duration = formatDuration(
              check.started_at,
              check.completed_at,
            );

            return (
              <div key={index} className="flex items-center gap-2 py-1.5">
                <Icon
                  className={cn("w-3.5 h-3.5 flex-shrink-0", colorClass, check.status !== "completed" && "animate-spin")}
                />
                <span className="flex-1 text-sm truncate text-primary">
                  {check.name}
                </span>
                {duration && (
                  <span className="text-xs flex-shrink-0 text-tertiary">
                    {duration}
                  </span>
                )}
                {check.url && (
                  <a
                    href={check.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded transition-colors flex-shrink-0 text-tertiary"
                    aria-label={`Open ${check.name} in new tab`}
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
        <div className="flex-1 flex items-center justify-center text-sm text-secondary">
          No checks
        </div>
      )}
    </div>
  );
}
