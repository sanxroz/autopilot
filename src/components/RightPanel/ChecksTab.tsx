import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Circle, Loader } from "lucide-react";
import { useCachedPRData } from "../../hooks/useCachedPRData";
import type { PRCheck, PRCheckDetail, PRStatus } from "../../types/github";
import { cn } from "../../utils/cn";
import { CheckRow } from "./CheckRow";
import {
  getCheckKey,
  getCheckDetailVersion,
  getMergeStatusColorClass,
  getMergeStatusText,
  isDeploymentCheck,
} from "./checks-tab-domain";

interface ChecksTabProps {
  repoPath: string | null;
  prNumber: number | null;
  prStatus: PRStatus | null;
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
}: {
  title: string;
  checks: PRCheck[];
  details: DetailState;
  detailErrors: ErrorState;
  loadingDetails: LoadingState;
  expandedKeys: Set<string>;
  onToggle: (check: PRCheck) => void;
}) {
  if (checks.length === 0) return null;

  return (
    <section className="px-4 pb-3">
      <div className="flex items-center justify-between pb-2 text-[11px] text-tertiary">
        <span className="uppercase tracking-[0.08em]">{title}</span>
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
            />
          );
        })}
      </div>
    </section>
  );
}

export function ChecksTab({ repoPath, prNumber, prStatus }: ChecksTabProps) {
  const { checksResult, prDetails, isLoading, error, fetchData } = useCachedPRData({ repoPath, prNumber, prStatus, includeChecks: true });
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<DetailState>({});
  const [detailVersions, setDetailVersions] = useState<DetailVersionState>({});
  const [loadingDetails, setLoadingDetails] = useState<LoadingState>({});
  const [detailErrors, setDetailErrors] = useState<ErrorState>({});

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

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-secondary">
        <Loader className="mr-2 h-3.5 w-3.5 animate-spin" />
        Loading checks...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-sm text-semantic-error">
        <span className="text-center">{error}</span>
        <button
          onClick={() => fetchData()}
          className="rounded bg-tertiary px-3 py-1 text-xs text-primary"
          type="button"
        >
          Retry
        </button>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col overflow-auto bg-primary">
      {prDetails && (
        <section className="px-4 py-4">
          <div className="rounded-xl border border-border-subtle bg-secondary/20 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Circle
                  className={cn(
                    "h-3.5 w-3.5 flex-shrink-0",
                    getMergeStatusColorClass(prDetails.merge_state_status),
                  )}
                />
                <div className="text-sm font-medium text-primary">
                  {getMergeStatusText(prDetails.merge_state_status)}
                </div>
              </div>
              <div className="mt-1 truncate text-[12px] text-tertiary">
                {prStatus ? `#${prStatus.number} ${prStatus.title}` : `#${prNumber}`}
              </div>
            </div>
          </div>
        </section>
      )}

      <CheckSection
        title="Deployments"
        checks={deploymentChecks}
        details={details}
        detailErrors={detailErrors}
        loadingDetails={loadingDetails}
        expandedKeys={expandedKeys}
        onToggle={handleToggleCheck}
      />
      <CheckSection
        title="Checks"
        checks={regularChecks}
        details={details}
        detailErrors={detailErrors}
        loadingDetails={loadingDetails}
        expandedKeys={expandedKeys}
        onToggle={handleToggleCheck}
      />

      {(!checksResult || checksResult.checks.length === 0) && (
        <div className="flex flex-1 items-center justify-center text-sm text-secondary">
          No checks reported by GitHub
        </div>
      )}
    </div>
  );
}
