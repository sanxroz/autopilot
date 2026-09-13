import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, Circle, Loader } from "lucide-react";
import { useCachedPRData } from "../../hooks/useCachedPRData";
import type { PRCheck, PRCheckDetail, PRStatus } from "../../types/github";
import { cn } from "../../utils/cn";
import { CheckRow } from "./CheckRow";
import {
  getCheckKey,
  getCheckDetailVersion,
  getCheckColorClass,
  getCheckLabel,
  getChecksSummaryLabel,
  isDeploymentCheck,
} from "./checks-tab-domain";

interface ChecksTabProps {
  repoPath: string | null;
  prNumber: number | null;
  prStatus: PRStatus | null;
  embedded?: boolean;
}

type DetailState = Record<string, PRCheckDetail | null>;
type DetailVersionState = Record<string, string>;
type LoadingState = Record<string, boolean>;
type ErrorState = Record<string, string | null>;

function CheckSection({
  title,
  checks,
  details,
  detailErrors,
  loadingDetails,
  expandedKeys,
  onToggle,
  onRetry,
}: {
  title: string;
  checks: PRCheck[];
  details: DetailState;
  detailErrors: ErrorState;
  loadingDetails: LoadingState;
  expandedKeys: Set<string>;
  onToggle: (check: PRCheck) => void;
  onRetry: (check: PRCheck) => void;
}) {
  if (checks.length === 0) return null;

  return (
    <section className="px-5 pb-4">
      <div className="flex items-center justify-between pb-1.5 text-[11px] text-tertiary">
        <span className="font-medium">{title}</span>
        <span className="font-mono tabular-nums">{checks.length}</span>
      </div>
      <div className="space-y-1">
        {checks.map((check) => {
          const key = getCheckKey(check);
          return (
            <CheckRow
              key={key}
              check={check}
              detail={details[key] ?? null}
              detailError={detailErrors[key] ?? null}
              isExpanded={expandedKeys.has(key)}
              isLoadingDetail={loadingDetails[key] ?? false}
              onToggle={onToggle}
              onRetry={onRetry}
            />
          );
        })}
      </div>
    </section>
  );
}

export function ChecksTab({
  repoPath,
  prNumber,
  prStatus,
  embedded = false,
}: ChecksTabProps) {
  const { checksResult, isLoading, error, fetchData } = useCachedPRData({
    repoPath,
    prNumber,
    prStatus,
    includeChecks: true,
    includeDetails: false,
  });
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<DetailState>({});
  const [detailVersions, setDetailVersions] = useState<DetailVersionState>({});
  const [loadingDetails, setLoadingDetails] = useState<LoadingState>({});
  const [detailErrors, setDetailErrors] = useState<ErrorState>({});
  const [showCheckDetails, setShowCheckDetails] = useState(prStatus?.checks_status === "failure");
  const checksAreFailing = prStatus?.checks_status === "failure";

  useEffect(() => {
    setShowCheckDetails(checksAreFailing);
  }, [prNumber, checksAreFailing]);

  useEffect(() => {
    const failedKeys = (checksResult?.checks ?? [])
      .filter((check) => check.bucket === "fail")
      .map(getCheckKey);
    if (failedKeys.length === 0) return;

    setExpandedKeys((current) => new Set([...current, ...failedKeys]));
  }, [checksResult]);

  const { deploymentChecks, regularChecks } = useMemo(() => {
    const allChecks = checksResult?.checks ?? [];
    return { deploymentChecks: allChecks.filter(isDeploymentCheck), regularChecks: allChecks.filter((check) => !isDeploymentCheck(check)) };
  }, [checksResult]);

  const loadCheckDetail = async (check: PRCheck) => {
    if (!repoPath) return;

    const key = getCheckKey(check);
    const version = getCheckDetailVersion(check);
    setLoadingDetails((state) => ({ ...state, [key]: true }));
    setDetailErrors((state) => ({ ...state, [key]: null }));

    try {
      const detail = await invoke<PRCheckDetail>("get_pr_check_detail", { repoPath, checkUrl: check.url });
      setDetails((state) => ({ ...state, [key]: detail }));
      setDetailVersions((state) => ({ ...state, [key]: version }));
    } catch (detailError) {
      setDetailErrors((state) => ({ ...state, [key]: String(detailError) }));
      setDetailVersions((state) => ({ ...state, [key]: version }));
    } finally {
      setLoadingDetails((state) => ({ ...state, [key]: false }));
    }
  };

  const handleToggleCheck = (check: PRCheck) => {
    const key = getCheckKey(check);
    const isExpanded = expandedKeys.has(key);

    setExpandedKeys((state) => {
      const next = new Set(state);
      if (isExpanded) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

    const detailVersion = getCheckDetailVersion(check);
    if (
      !isExpanded &&
      check.is_actions_job &&
      detailVersions[key] !== detailVersion &&
      !loadingDetails[key]
    ) {
      void loadCheckDetail(check);
    }
  };

  useEffect(() => {
    const allChecks = checksResult?.checks ?? [];

    for (const check of allChecks) {
      if (!check.is_actions_job) {
        continue;
      }

      const key = getCheckKey(check);
      if (!expandedKeys.has(key) || loadingDetails[key]) {
        continue;
      }

      if (detailVersions[key] !== getCheckDetailVersion(check)) {
        void loadCheckDetail(check);
      }
    }
  }, [checksResult, detailVersions, expandedKeys, loadingDetails]);

  if (!prNumber) return <div className="flex flex-1 items-center justify-center text-sm text-secondary">No PR found for this branch</div>;

  if (error) {
    return (
      <div className="flex flex-col items-start gap-2 px-5 py-4 text-xs text-tertiary">
        <span>Checks couldn’t be loaded.</span>
        <button
          onClick={() => fetchData()}
          className="rounded-md bg-secondary px-2 py-1 font-medium text-secondary transition-colors hover:bg-hover hover:text-primary"
          type="button"
        >
          Retry
        </button>
      </div>
    );
  }

  const overallStatus = checksResult?.overall_status ?? prStatus?.checks_status;
  const overallBucket =
    overallStatus === "failure" ? "fail" :
    overallStatus === "success" ? "pass" :
    overallStatus === "cancelled" ? "cancel" :
    overallStatus === "skipped" ? "skipping" :
    overallStatus ?? "unknown";
  const overallLabel =
    overallStatus === "none" ? "No checks" :
    overallStatus ? getCheckLabel(overallBucket) : "Loading checks";

  return (
    <div
      className={cn(
        "flex flex-col bg-primary",
        !embedded && "h-full overflow-auto",
      )}
    >
      {prStatus && (
        <section aria-label="Checks" className={embedded ? "px-5 py-2" : "px-4 py-4"}>
          <div className={cn(embedded ? "" : "rounded-lg border border-border-subtle bg-secondary/20 px-4 py-3")}>
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => setShowCheckDetails((show) => !show)}
                className="-mx-2 flex min-h-12 w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg bg-secondary/40 px-2 text-left transition-colors hover:bg-secondary/60 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2"
                aria-expanded={showCheckDetails}
                aria-controls="pr-check-details"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Circle
                    className={cn(
                      "h-3 w-3 flex-shrink-0",
                      getCheckColorClass(overallBucket),
                    )}
                  />
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="text-[13px] font-semibold text-primary">Checks</span>
                    <span className="truncate text-xs text-secondary">{overallLabel}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {checksResult && checksResult.summary.total > 0 && (
                    <span className="font-mono text-[11px] tabular-nums text-tertiary">
                      {getChecksSummaryLabel(checksResult.summary)}
                    </span>
                  )}
                  <ChevronDown className={cn("size-4 text-tertiary transition-transform motion-reduce:transition-none", showCheckDetails && "rotate-180")} />
                </div>
              </button>
              {!embedded && (
                <div className="mt-1 truncate text-[12px] text-tertiary">
                  #{prStatus.number} {prStatus.title}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {isLoading && !checksResult && (
        <div className="flex items-center px-5 py-6 text-[13px] text-secondary">
          <Loader className="mr-2 h-3.5 w-3.5 animate-spin" />
          Loading checks…
        </div>
      )}

      <div id="pr-check-details" hidden={!showCheckDetails}>
        {checksResult && <CheckSection
          title="Deployments"
          checks={deploymentChecks}
          details={details}
          detailErrors={detailErrors}
          loadingDetails={loadingDetails}
          expandedKeys={expandedKeys}
          onToggle={handleToggleCheck}
          onRetry={(check) => void loadCheckDetail(check)}
        />}
        {checksResult && <CheckSection
          title="Checks"
          checks={regularChecks}
          details={details}
          detailErrors={detailErrors}
          loadingDetails={loadingDetails}
          expandedKeys={expandedKeys}
          onToggle={handleToggleCheck}
          onRetry={(check) => void loadCheckDetail(check)}
        />}

        {!isLoading && (!checksResult || checksResult.checks.length === 0) && (
          <div className="px-5 py-6 text-[13px] text-tertiary">
            No checks reported by GitHub
          </div>
        )}
      </div>
    </div>
  );
}
