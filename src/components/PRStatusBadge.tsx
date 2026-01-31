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
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../theme";
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

function getBadgeVariant(prStatus: PRStatus, theme: Theme): BadgeVariant {
  if (prStatus.merged) {
    return {
      icon: GitMerge,
      color: theme.terminal.magenta,
      bgColor: `${theme.terminal.magenta}26`,
      label: "Merged",
    };
  }

  if (prStatus.state === "closed") {
    return {
      icon: X,
      color: theme.semantic.error,
      bgColor: theme.semantic.errorMuted,
      label: "Closed",
    };
  }

  if (prStatus.draft) {
    return {
      icon: CircleDashed,
      color: theme.text.tertiary,
      bgColor: theme.bg.tertiary,
      label: "Draft",
    };
  }

  if (prStatus.checks_status === "failure") {
    return {
      icon: X,
      color: theme.semantic.error,
      bgColor: theme.semantic.errorMuted,
      label: "Failing",
    };
  }

  if (prStatus.checks_status === "pending") {
    return {
      icon: Loader,
      color: theme.semantic.warning,
      bgColor: theme.semantic.warningMuted,
      label: "Running",
    };
  }

  switch (prStatus.review_decision) {
    case "APPROVED":
      return {
        icon: Check,
        color: theme.semantic.success,
        bgColor: theme.semantic.successMuted,
        label: "Approved",
      };
    case "CHANGES_REQUESTED":
      return {
        icon: AlertTriangle,
        color: theme.semantic.warning,
        bgColor: theme.semantic.warningMuted,
        label: "Changes",
      };
    default:
      return {
        icon: Clock,
        color: theme.semantic.info,
        bgColor: theme.semantic.infoMuted,
        label: "Review",
      };
  }
}

export function PRStatusBadge({
  prStatus,
  compact = false,
}: PRStatusBadgeProps) {
  const theme = useTheme();
  const variant = getBadgeVariant(prStatus, theme);
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
            variant.icon === Loader ? "animate-spin" : ""
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
        className={`w-3 h-3 ${variant.icon === Loader ? "animate-spin" : ""}`}
      />
      <span>#{prStatus.number}</span>
      <span className="opacity-70">{variant.label}</span>
    </a>
  );
}
