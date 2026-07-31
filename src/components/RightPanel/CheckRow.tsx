import {
  Check,
  ChevronDown,
  Circle,
  Loader,
  X,
} from "lucide-react";
import { cn } from "../../utils/cn";
import type { PRCheck, PRCheckDetail } from "../../types/github";
import {
  formatDuration,
  getCheckBadgeClass,
  getCheckColorClass,
  getCheckLabel,
} from "./checks-tab-domain";
import { CheckRowDetails } from "./CheckRowDetails";

function getCheckIcon(bucket: string) {
  switch (bucket) {
    case "pass":
      return Check;
    case "fail":
    case "cancel":
      return X;
    case "pending":
      return Loader;
    default:
      return Circle;
  }
}

interface CheckRowProps {
  check: PRCheck;
  detail: PRCheckDetail | null;
  detailError: string | null;
  isExpanded: boolean;
  isLoadingDetail: boolean;
  onToggle: (check: PRCheck) => void;
}

export function CheckRow({
  check,
  detail,
  detailError,
  isExpanded,
  isLoadingDetail,
  onToggle,
}: CheckRowProps) {
  const Icon = getCheckIcon(check.bucket);
  const duration = formatDuration(check.started_at, check.completed_at);
  const statusLabel = getCheckLabel(check.bucket);
  const showStatusBadge =
    check.bucket !== "pass" && check.bucket !== "skipping";

  return (
    <div>
      <button
        onClick={() => onToggle(check)}
        className="group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-hover/40 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px]"
        type="button"
      >
        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
          <Icon
            className={cn(
              "h-3.5 w-3.5",
              getCheckColorClass(check.bucket),
              check.bucket === "pending" && "animate-spin",
            )}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 truncate text-[12px] leading-5 text-primary">
              {check.name}
            </div>

            <div className="flex flex-shrink-0 items-center gap-2">
              <div className="flex items-center gap-2">
                {duration && (
                  <span className="font-mono tabular-nums text-[11px] text-tertiary">
                    {duration}
                  </span>
                )}
                {showStatusBadge && (
                  <span
                    className={cn(
                      "inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium",
                      getCheckBadgeClass(check.bucket),
                    )}
                  >
                    {statusLabel}
                  </span>
                )}
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-tertiary transition-transform",
                  isExpanded && "rotate-180",
                )}
              />
            </div>
          </div>
        </div>
      </button>

      {isExpanded && (
        <CheckRowDetails
          check={check}
          detail={detail}
          detailError={detailError}
          isLoadingDetail={isLoadingDetail}
        />
      )}
    </div>
  );
}
