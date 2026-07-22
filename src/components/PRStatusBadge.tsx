import {
  GitPullRequest,
  Check,
  X,
  Clock,
  CircleDashed,
  GitMerge,
  AlertTriangle,
  Loader,
} from "lucide-react";
import type { PRStatus } from "../types/github";
import { cn } from "../utils/cn";

interface PRStatusBadgeProps {
  prStatus: PRStatus;
  compact?: boolean;
}

type BadgeVariant = {
  icon: typeof GitPullRequest;
  colorClass: string;
  bgClass: string;
  label: string;
};

function getBadgeVariant(prStatus: PRStatus): BadgeVariant {
  if (prStatus.merged) {
    return {
      icon: GitMerge,
      colorClass: "text-semantic-merged",
      bgClass: "bg-semantic-merged-muted",
      label: "Merged",
    };
  }

  if (prStatus.state === "closed") {
    return {
      icon: X,
      colorClass: "text-semantic-error",
      bgClass: "bg-semantic-error-muted",
      label: "Closed",
    };
  }

  if (prStatus.draft) {
    return {
      icon: CircleDashed,
      colorClass: "text-tertiary",
      bgClass: "bg-tertiary",
      label: "Draft",
    };
  }

  if (prStatus.checks_status === "failure") {
    return {
      icon: X,
      colorClass: "text-semantic-error",
      bgClass: "bg-semantic-error-muted",
      label: "Failing",
    };
  }

  if (prStatus.checks_status === "pending") {
    return {
      icon: Loader,
      colorClass: "text-semantic-warning",
      bgClass: "bg-semantic-warning-muted",
      label: "Running",
    };
  }

  if (prStatus.has_unresolved_review_threads) {
    return {
      icon: AlertTriangle,
      colorClass: "text-semantic-attention",
      bgClass: "bg-semantic-warning-muted",
      label: "Comments",
    };
  }

  switch (prStatus.review_decision) {
    case "APPROVED":
      return {
        icon: Check,
        colorClass: "text-semantic-success",
        bgClass: "bg-semantic-success-muted",
        label: "Approved",
      };
    case "CHANGES_REQUESTED":
      return {
        icon: AlertTriangle,
        colorClass: "text-semantic-warning",
        bgClass: "bg-semantic-warning-muted",
        label: "Changes",
      };
    default:
      return {
        icon: Clock,
        colorClass: "text-semantic-info",
        bgClass: "bg-semantic-info-muted",
        label: "Review",
      };
  }
}

export function PRStatusBadge({
  prStatus,
  compact = false,
}: PRStatusBadgeProps) {
  const variant = getBadgeVariant(prStatus);
  const Icon = variant.icon;

  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center gap-1 text-sm font-medium px-1.5 py-0.5 rounded",
          variant.colorClass,
          variant.bgClass
        )}
        title={`PR #${prStatus.number}: ${prStatus.title}`}
      >
        <Icon
          className={cn("w-2.5 h-2.5", variant.icon === Loader && "animate-spin")}
        />
        <span>#{prStatus.number}</span>
      </div>
    );
  }

  return (
    <a
      href={prStatus.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded transition-opacity hover:opacity-80",
        variant.colorClass,
        variant.bgClass
      )}
      title={prStatus.title}
    >
      <Icon
        className={cn("w-3 h-3", variant.icon === Loader && "animate-spin")}
      />
      <span>#{prStatus.number}</span>
      <span className="opacity-70">{variant.label}</span>
    </a>
  );
}
