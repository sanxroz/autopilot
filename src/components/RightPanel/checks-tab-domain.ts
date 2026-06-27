import type { PRCheck } from "../../types/github";

export function formatDuration(
  startedAt: string | null,
  completedAt: string | null,
): string {
  if (!startedAt || !completedAt) {
    return "";
  }

  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  const durationMs = end - start;

  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return "";
  }
  if (durationMs < 1000) {
    return "0s";
  }
  if (durationMs < 60_000) {
    return `${Math.round(durationMs / 1000)}s`;
  }
  if (durationMs < 3_600_000) {
    return `${Math.round(durationMs / 60_000)}m`;
  }
  return `${Math.round(durationMs / 3_600_000)}h`;
}

export function formatTimestamp(value: string | null): string {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function getCheckLabel(bucket: string): string {
  switch (bucket) {
    case "pass":
      return "Passed";
    case "fail":
      return "Failed";
    case "pending":
      return "Running";
    case "skipping":
      return "Skipped";
    case "cancel":
      return "Cancelled";
    default:
      return "Unknown";
  }
}

export function getCheckColorClass(bucket: string): string {
  switch (bucket) {
    case "pass":
      return "text-semantic-success";
    case "fail":
      return "text-semantic-error";
    case "pending":
      return "text-semantic-warning";
    case "cancel":
      return "text-semantic-error";
    case "skipping":
      return "text-tertiary";
    default:
      return "text-secondary";
  }
}

export function getCheckBadgeClass(bucket: string): string {
  switch (bucket) {
    case "pass":
      return "border-semantic-success/20 bg-semantic-success/10 text-semantic-success";
    case "fail":
      return "border-semantic-error/20 bg-semantic-error/10 text-semantic-error";
    case "pending":
      return "border-semantic-warning/20 bg-semantic-warning/10 text-semantic-warning";
    case "cancel":
      return "border-semantic-error/20 bg-semantic-error/10 text-semantic-error";
    case "skipping":
      return "border-border bg-tertiary text-secondary";
    default:
      return "border-border bg-tertiary text-secondary";
  }
}

export function getCheckSurfaceClass(bucket: string): string {
  switch (bucket) {
    case "pass":
      return "border-semantic-success/15 bg-semantic-success/5";
    case "fail":
      return "border-semantic-error/15 bg-semantic-error/5";
    case "pending":
      return "border-semantic-warning/15 bg-semantic-warning/5";
    case "cancel":
      return "border-semantic-error/15 bg-semantic-error/5";
    case "skipping":
      return "border-border/70 bg-secondary/35";
    default:
      return "border-border/70 bg-secondary/30";
  }
}

export function getMergeStatusText(status: string): string {
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

export function getMergeStatusColorClass(status: string): string {
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

export function isDeploymentCheck(check: PRCheck): boolean {
  const label = `${check.name} ${check.workflow ?? ""}`.toLowerCase();
  return (
    label.includes("vercel") ||
    label.includes("deploy") ||
    label.includes("preview")
  );
}

export function getCheckKey(check: PRCheck): string {
  return check.job_id
    ? `job:${check.job_id}`
    : `${check.name}:${check.url ?? "local"}:${check.started_at ?? "unknown"}`;
}
