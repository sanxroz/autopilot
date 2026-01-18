import {
  GitPullRequest,
  Check,
  X,
  Clock,
  CircleDashed,
  GitMerge,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import type { PRStatus } from "../types/github";

interface PRStatusBadgeProps {
  prStatus: PRStatus;
  compact?: boolean;
}

type BadgeVariant = {
  icon: typeof GitPullRequest;
  color: string;
  bgColor: string;
  label: string;
};

function getBadgeVariant(prStatus: PRStatus): BadgeVariant {
  if (prStatus.merged) {
    return {
      icon: GitMerge,
      color: "#A855F7",
      bgColor: "rgba(168, 85, 247, 0.15)",
      label: "Merged",
    };
  }

  if (prStatus.state === "closed") {
    return {
      icon: X,
      color: "#EF4444",
      bgColor: "rgba(239, 68, 68, 0.15)",
      label: "Closed",
    };
  }

  if (prStatus.draft) {
    return {
      icon: CircleDashed,
      color: "#6B7280",
      bgColor: "rgba(107, 114, 128, 0.15)",
      label: "Draft",
    };
  }

  if (prStatus.checks_status === "failure") {
    return {
      icon: X,
      color: "#EF4444",
      bgColor: "rgba(239, 68, 68, 0.15)",
      label: "Failing",
    };
  }

  if (prStatus.checks_status === "pending") {
    return {
      icon: Loader2,
      color: "#F59E0B",
      bgColor: "rgba(245, 158, 11, 0.15)",
      label: "Running",
    };
  }

  switch (prStatus.review_decision) {
    case "APPROVED":
      return {
        icon: Check,
        color: "#22C55E",
        bgColor: "rgba(34, 197, 94, 0.15)",
        label: "Approved",
      };
    case "CHANGES_REQUESTED":
      return {
        icon: AlertTriangle,
        color: "#F59E0B",
        bgColor: "rgba(245, 158, 11, 0.15)",
        label: "Changes",
      };
    default:
      return {
        icon: Clock,
        color: "#3B82F6",
        bgColor: "rgba(59, 130, 246, 0.15)",
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
        className="flex items-center gap-1 text-sm font-medium px-1.5 py-0.5 rounded"
        style={{ color: variant.color, background: variant.bgColor }}
        title={`PR #${prStatus.number}: ${prStatus.title}`}
      >
        <Icon
          className={`w-2.5 h-2.5 ${
            variant.icon === Loader2 ? "animate-spin" : ""
          }`}
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
      className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded transition-opacity hover:opacity-80"
      style={{ color: variant.color, background: variant.bgColor }}
      title={prStatus.title}
    >
      <Icon
        className={`w-3 h-3 ${variant.icon === Loader2 ? "animate-spin" : ""}`}
      />
      <span>#{prStatus.number}</span>
      <span className="opacity-70">{variant.label}</span>
    </a>
  );
}
