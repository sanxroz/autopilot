import type { ProcessStatus, Repository, WorktreeInfo } from "../types";
import type { SessionSection } from "./session-sections";

const ACTIVE_SPACE_STORAGE_KEY = "autopilot-active-space";

export type SpaceActivity = "attention" | "running" | null;

export function getSpaceActivity(
  sections: readonly SessionSection[],
  processStatuses: readonly ProcessStatus[],
): SpaceActivity {
  if (
    sections.some(
      (section) =>
        section === "agent:attention" || section === "pr:attention",
    )
  ) {
    return "attention";
  }

  return processStatuses.some((status) => status !== "none") ||
    sections.some(
      (section) => section === "agent:running" || section === "pr:checks",
    )
    ? "running"
    : null;
}

export function findSpaceForWorktree(
  repositories: readonly Repository[],
  worktree: WorktreeInfo | null,
): string | null {
  if (!worktree) return null;

  return (
    repositories.find((repository) =>
      repository.worktrees.some((candidate) => candidate.path === worktree.path),
    )?.info.path ?? null
  );
}

export function resolveActiveSpace(
  repositories: readonly Repository[],
  selectedWorktree: WorktreeInfo | null,
  preferredPath: string | null,
): string | null {
  return (
    findSpaceForWorktree(repositories, selectedWorktree) ??
    repositories.find((repository) => repository.info.path === preferredPath)?.info.path ??
    repositories[0]?.info.path ??
    null
  );
}

export function loadActiveSpace(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_SPACE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveSpace(path: string): void {
  try {
    window.localStorage.setItem(ACTIVE_SPACE_STORAGE_KEY, path);
  } catch {
    // A locked-down WebView can deny storage. Space switching still works in memory.
  }
}
