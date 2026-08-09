import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Plus,
  Minus,
  RotateCcw,
  Upload,
  FilePlus,
  FileEdit,
  FileMinus,
  Loader,
  GitBranch,
  GitCommit,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { useAppStore } from "../../store";
import type { GitStatus, GitStatusFile } from "../../types";
import {
  invalidateGitFileDiffCache,
  loadGitFileDiff,
} from "../../lib/git-file-diff-cache";
import { createCoalescedTask } from "../../lib/coalesced-task";

import { cn } from "../../utils/cn";

interface GitTabProps {
  worktreePath: string | null;
}

function getFileIcon(status: string) {
  const statusLower = status.toLowerCase();
  if (statusLower === "added" || statusLower === "untracked") {
    return FilePlus;
  }
  if (statusLower === "deleted") {
    return FileMinus;
  }
  return FileEdit;
}

function getFileColorClass(status: string): string {
  const statusLower = status.toLowerCase();
  if (statusLower === "added" || statusLower === "untracked") {
    return "text-semantic-success";
  }
  if (statusLower === "deleted") {
    return "text-semantic-error";
  }
  return "text-semantic-warning";
}

function getFileName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1];
}

function getFileDirectory(path: string): string {
  const parts = path.split("/");
  return parts.slice(0, -1).join("/");
}

export function GitTab({ worktreePath }: GitTabProps) {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStaging, setIsStaging] = useState(false);
  const [revertingFile, setRevertingFile] = useState<string | null>(null);
  const [stagedOpen, setStagedOpen] = useState(true);
  const [unstagedOpen, setUnstagedOpen] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeFetchIdRef = useRef(0);
  const latestWorktreePathRef = useRef(worktreePath);
  const defaultAIAgent = useAppStore((state) => state.defaultAIAgent);
  const gitFileDiffPreview = useAppStore((state) => state.gitFileDiffPreview);
  const setGitFileDiffPreview = useAppStore((state) => state.setGitFileDiffPreview);

  const isOperationInProgress =
    isStaging || revertingFile !== null || isCommitting || isPushing || isGenerating;

  latestWorktreePathRef.current = worktreePath;

  const fetchStatus = useCallback(async () => {
    const requestedWorktreePath = latestWorktreePathRef.current;
    if (!requestedWorktreePath) {
      activeFetchIdRef.current += 1;
      setIsLoading(false);
      setGitStatus(null);
      return;
    }

    const fetchId = activeFetchIdRef.current + 1;
    activeFetchIdRef.current = fetchId;
    setIsLoading(true);
    setError(null);

    try {
      const status = await invoke<GitStatus>("get_git_status", {
        worktreePath: requestedWorktreePath,
      });
      if (
        activeFetchIdRef.current !== fetchId ||
        latestWorktreePathRef.current !== requestedWorktreePath
      ) {
        return;
      }
      setGitStatus(status);
    } catch (e) {
      if (
        activeFetchIdRef.current !== fetchId ||
        latestWorktreePathRef.current !== requestedWorktreePath
      ) {
        return;
      }
      setError(String(e));
      setGitStatus(null);
    } finally {
      if (
        activeFetchIdRef.current !== fetchId ||
        latestWorktreePathRef.current !== requestedWorktreePath
      ) {
        return;
      }
      setIsLoading(false);
    }
  }, []);

  const refreshStatusRef = useRef<(() => Promise<void>) | null>(null);
  if (!refreshStatusRef.current) {
    refreshStatusRef.current = createCoalescedTask(fetchStatus);
  }
  const refreshStatus = refreshStatusRef.current;

  useEffect(() => {
    return () => {
      activeFetchIdRef.current += 1;
    };
  }, []);

  const scheduleStatusRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      const currentWorktreePath = latestWorktreePathRef.current;
      if (currentWorktreePath) invalidateGitFileDiffCache(currentWorktreePath);
      void refreshStatus();
    }, 1_000);
  }, [refreshStatus]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus, worktreePath]);

  useEffect(() => {
    const refreshOnFocus = () => {
      const currentWorktreePath = latestWorktreePathRef.current;
      if (!currentWorktreePath || document.visibilityState !== "visible") return;
      invalidateGitFileDiffCache(currentWorktreePath);
      void refreshStatus();
    };

    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [refreshStatus]);

  useEffect(() => {
    if (!worktreePath) return;

    const unlistenFileChanged = listen<{ worktree_path: string }>("file-changed", (event) => {
      if (event.payload.worktree_path === worktreePath) {
        scheduleStatusRefresh();
      }
    });

    const unlistenIndexChanged = listen<{ worktree_path: string }>("git-index-changed", (event) => {
      if (event.payload.worktree_path === worktreePath) {
        scheduleStatusRefresh();
      }
    });

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      if (prefetchTimerRef.current) {
        clearTimeout(prefetchTimerRef.current);
        prefetchTimerRef.current = null;
      }
      unlistenFileChanged.then((fn) => fn());
      unlistenIndexChanged.then((fn) => fn());
    };
  }, [worktreePath, scheduleStatusRefresh]);

  useEffect(() => {
    if (gitFileDiffPreview && gitStatus) {
      // Clear preview if viewing a different worktree
      if (gitFileDiffPreview.worktreePath !== worktreePath) {
        setGitFileDiffPreview(null);
        return;
      }

      const staged = gitStatus.staged || [];
      const unstaged = gitStatus.unstaged || [];
      const inStaged = staged.some(f => f.path === gitFileDiffPreview.filePath);
      const inUnstaged = unstaged.some(f => f.path === gitFileDiffPreview.filePath);

      // File is partially staged (in both lists) - keep user's current selection
      if (inStaged && inUnstaged) return;

      if (!inStaged && !inUnstaged) {
        // File no longer exists in either list
        setGitFileDiffPreview(null);
      } else if (inStaged && !gitFileDiffPreview.isStaged) {
        // File moved from unstaged to staged - update preview
        setGitFileDiffPreview({ ...gitFileDiffPreview, isStaged: true });
      } else if (inUnstaged && gitFileDiffPreview.isStaged) {
        // File moved from staged to unstaged - update preview
        setGitFileDiffPreview({ ...gitFileDiffPreview, isStaged: false });
      }
    }
  }, [gitStatus, gitFileDiffPreview, setGitFileDiffPreview, worktreePath]);

  const handleSelectFile = useCallback((file: GitStatusFile, isStaged: boolean) => {
    if (!worktreePath) return;
    
    if (gitFileDiffPreview?.filePath === file.path && gitFileDiffPreview?.isStaged === isStaged) {
      setGitFileDiffPreview(null);
    } else {
      invalidateGitFileDiffCache(worktreePath);
      setGitFileDiffPreview({ filePath: file.path, worktreePath, isStaged });
    }
  }, [worktreePath, gitFileDiffPreview, setGitFileDiffPreview]);

  const prefetchFile = useCallback((file: GitStatusFile, isStaged: boolean) => {
    if (!worktreePath) return;
    if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    prefetchTimerRef.current = setTimeout(() => {
      prefetchTimerRef.current = null;
      void loadGitFileDiff(worktreePath, file.path, isStaged, false).catch(() => {});
    }, 100);
  }, [worktreePath]);

  const handleStageFiles = useCallback(async (files: string[]) => {
    if (!worktreePath || files.length === 0 || isOperationInProgress) return;
    setIsStaging(true);
    try {
      await invoke("git_stage_files", { worktreePath, files });
      await refreshStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsStaging(false);
    }
  }, [worktreePath, refreshStatus, isOperationInProgress]);

  const handleUnstageFiles = useCallback(async (files: string[]) => {
    if (!worktreePath || files.length === 0 || isOperationInProgress) return;
    setIsStaging(true);
    try {
      await invoke("git_unstage_files", { worktreePath, files });
      await refreshStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsStaging(false);
    }
  }, [worktreePath, refreshStatus, isOperationInProgress]);

  const handleRevertFile = useCallback(
    async (file: GitStatusFile, isStaged: boolean) => {
      if (!worktreePath || isOperationInProgress) return;
      const confirmed = window.confirm(
        `Are you sure you want to revert "${file.path}"? This action cannot be undone.`
      );
      if (!confirmed) return;
      setRevertingFile(file.path);
      setError(null);
      try {
        await invoke("git_revert_file", {
          worktreePath,
          filePath: file.path,
          isStaged,
          status: file.status,
        });
        await refreshStatus();
      } catch (e) {
        setError(String(e));
      } finally {
        setRevertingFile(null);
      }
    },
    [worktreePath, refreshStatus, isOperationInProgress]
  );

  const handleStageAll = useCallback(async () => {
    if (!worktreePath || isOperationInProgress) return;
    setIsStaging(true);
    try {
      await invoke("git_stage_all", { worktreePath });
      await refreshStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsStaging(false);
    }
  }, [worktreePath, refreshStatus, isOperationInProgress]);

  const handleUnstageAll = useCallback(async () => {
    if (!worktreePath || isOperationInProgress) return;
    setIsStaging(true);
    try {
      await invoke("git_unstage_all", { worktreePath });
      await refreshStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsStaging(false);
    }
  }, [worktreePath, refreshStatus, isOperationInProgress]);

  const handleCommit = useCallback(async () => {
    if (!worktreePath || !commitMessage.trim() || isOperationInProgress) return;
    setIsCommitting(true);
    setError(null);
    try {
      await invoke<string>("git_commit", { worktreePath, message: commitMessage.trim() });
      setCommitMessage("");
      await refreshStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsCommitting(false);
    }
  }, [worktreePath, commitMessage, refreshStatus, isOperationInProgress]);

  const handlePush = useCallback(async () => {
    if (!worktreePath) return;
    setIsPushing(true);
    setError(null);
    try {
      await invoke("git_push", { worktreePath });
      await refreshStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsPushing(false);
    }
  }, [worktreePath, refreshStatus]);

  const handleGenerateMessage = useCallback(async () => {
    if (!worktreePath) return;
    setIsGenerating(true);
    setError(null);
    try {
      const message = await invoke<string>("generate_commit_message", {
        worktreePath,
        agent: defaultAIAgent,
      });
      setCommitMessage(message);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsGenerating(false);
    }
  }, [worktreePath, defaultAIAgent]);

  if (!worktreePath) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-tertiary">
        No worktree selected
      </div>
    );
  }

  if (isLoading && !gitStatus) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 text-sm text-tertiary">
        <Loader className="w-4 h-4 animate-spin" />
        <span>Loading...</span>
      </div>
    );
  }

  if (error && !gitStatus) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
        <span className="text-sm text-center text-tertiary">{error}</span>
        <button
          onClick={() => void refreshStatus()}
          className="px-3 py-1.5 rounded text-xs font-medium transition-colors bg-tertiary text-primary"
        >
          Try again
        </button>
      </div>
    );
  }

  const staged = gitStatus?.staged || [];
  const unstaged = gitStatus?.unstaged || [];
  const totalChanges = new Set(
    [...staged, ...unstaged].map((file) => file.path),
  ).size;
  const canCommit =
    staged.length > 0 &&
    commitMessage.trim().length > 0 &&
    !isOperationInProgress;

  const renderFileItem = (file: GitStatusFile, isStaged: boolean) => {
    const Icon = getFileIcon(file.status);
    const colorClass = getFileColorClass(file.status);
    const fileName = getFileName(file.path);
    const directory = getFileDirectory(file.path);
    const isSelected = gitFileDiffPreview?.filePath === file.path && gitFileDiffPreview?.isStaged === isStaged;

    return (
      <div
        key={file.path}
        className={cn(
          "group flex min-h-8 cursor-pointer items-center gap-2 px-3 text-primary transition-colors",
          isSelected ? "bg-active" : "bg-transparent hover:bg-hover"
        )}
        onClick={() => handleSelectFile(file, isStaged)}
        onMouseEnter={() => prefetchFile(file, isStaged)}
        onMouseLeave={() => {
          if (prefetchTimerRef.current) {
            clearTimeout(prefetchTimerRef.current);
            prefetchTimerRef.current = null;
          }
        }}
        onFocus={() => prefetchFile(file, isStaged)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleSelectFile(file, isStaged);
          }
        }}
        aria-selected={isSelected}
      >
        <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", colorClass)} strokeWidth={1.5} />
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="truncate text-[12px] text-primary">{fileName}</span>
          {directory && (
            <span className="truncate font-mono text-[10px] text-muted">
              {directory}
            </span>
          )}
        </div>
        <div
          className="pointer-events-none flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
        >
          <button
            className="flex h-6 w-6 items-center justify-center rounded text-tertiary transition-colors hover:bg-tertiary hover:text-primary active:scale-[0.97] disabled:cursor-not-allowed disabled:text-muted"
            disabled={isOperationInProgress}
            onClick={(e) => {
              e.stopPropagation();
              void handleRevertFile(file, isStaged);
            }}
            aria-label={`Revert ${fileName}`}
            title={`Revert ${fileName}`}
          >
            {revertingFile === file.path ? (
              <Loader className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
          </button>
          <button
            className="flex h-6 w-6 items-center justify-center rounded text-tertiary transition-colors hover:bg-tertiary hover:text-primary active:scale-[0.97] disabled:cursor-not-allowed disabled:text-muted"
            disabled={isOperationInProgress}
            onClick={(e) => {
              e.stopPropagation();
              if (isStaged) {
                void handleUnstageFiles([file.path]);
              } else {
                void handleStageFiles([file.path]);
              }
            }}
            aria-label={isStaged ? `Unstage ${fileName}` : `Stage ${fileName}`}
            title={isStaged ? `Unstage ${fileName}` : `Stage ${fileName}`}
          >
            {isStaging ? (
              <Loader className="h-3.5 w-3.5 animate-spin" />
            ) : isStaged ? (
              <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
            ) : (
              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
        <span className="text-[12px] font-medium text-primary">Changes</span>
        <span className="font-mono text-[10px] tabular-nums text-muted">
          {totalChanges}
        </span>
        <span className="flex h-3 w-3 items-center justify-center">
          {isLoading && <Loader className="h-3 w-3 animate-spin text-muted" />}
        </span>
      </div>

      {totalChanges > 0 && (
        <div className="min-h-0 flex-1 overflow-auto py-1">
          {staged.length > 0 && (
            <div>
              <div className="flex h-8 items-center justify-between px-2">
                <button
                  type="button"
                  onClick={() => setStagedOpen((open) => !open)}
                  className="flex h-7 min-w-0 items-center gap-1.5 rounded px-1 text-[11px] font-medium text-secondary hover:text-primary"
                  aria-expanded={stagedOpen}
                >
                  <ChevronDown
                    className={cn("h-3 w-3 transition-transform", !stagedOpen && "-rotate-90")}
                    strokeWidth={1.5}
                  />
                  <span>Staged</span>
                  <span className="font-mono text-[10px] tabular-nums text-muted">
                    {staged.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleUnstageAll}
                  disabled={isOperationInProgress}
                  className="h-6 rounded px-1.5 text-[10px] text-tertiary transition-colors hover:bg-hover hover:text-primary active:scale-[0.97] disabled:cursor-not-allowed disabled:text-muted"
                >
                  {isStaging ? "Unstaging…" : "Unstage all"}
                </button>
              </div>
              {stagedOpen && staged.map((file) => renderFileItem(file, true))}
            </div>
          )}

          {unstaged.length > 0 && (
            <div>
              <div className="flex h-8 items-center justify-between px-2">
                <button
                  type="button"
                  onClick={() => setUnstagedOpen((open) => !open)}
                  className="flex h-7 min-w-0 items-center gap-1.5 rounded px-1 text-[11px] font-medium text-secondary hover:text-primary"
                  aria-expanded={unstagedOpen}
                >
                  <ChevronDown
                    className={cn("h-3 w-3 transition-transform", !unstagedOpen && "-rotate-90")}
                    strokeWidth={1.5}
                  />
                  <span>Unstaged</span>
                  <span className="font-mono text-[10px] tabular-nums text-muted">
                    {unstaged.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleStageAll}
                  disabled={isOperationInProgress}
                  className="h-6 rounded px-1.5 text-[10px] text-tertiary transition-colors hover:bg-hover hover:text-primary active:scale-[0.97] disabled:cursor-not-allowed disabled:text-muted"
                >
                  {isStaging ? "Staging…" : "Stage all"}
                </button>
              </div>
              {unstagedOpen && unstaged.map((file) => renderFileItem(file, false))}
            </div>
          )}
        </div>
      )}

      {totalChanges === 0 && (
        <div className="flex flex-1 items-center justify-center text-[12px] text-tertiary">
          Working tree clean
        </div>
      )}

      {error && gitStatus && (
        <div className="border-t border-border-subtle px-3 py-2 text-[11px] text-semantic-error">
          {error}
        </div>
      )}

      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-border-subtle px-3">
        <GitBranch className="h-3.5 w-3.5 text-muted" strokeWidth={1.5} />
        <span className="min-w-0 truncate font-mono text-[11px] text-secondary">
          {gitStatus?.branch || "unknown"}
        </span>
        {gitStatus && gitStatus.ahead > 0 && (
          <span className="font-mono text-[10px] tabular-nums text-tertiary">
            ↑{gitStatus.ahead}
          </span>
        )}
        {gitStatus && gitStatus.behind > 0 && (
          <span className="font-mono text-[10px] tabular-nums text-tertiary">
            ↓{gitStatus.behind}
          </span>
        )}
        {gitStatus && (gitStatus.ahead > 0 || !gitStatus.upstream_branch) && (
          <button
            onClick={handlePush}
            disabled={isOperationInProgress}
            className="ml-auto flex h-6 items-center gap-1.5 rounded px-1.5 text-[10px] text-secondary transition-colors hover:bg-hover hover:text-primary active:scale-[0.97] disabled:cursor-wait disabled:text-muted"
          >
            {isPushing ? (
              <Loader className="h-3 w-3 animate-spin" />
            ) : (
              <Upload className="h-3 w-3" strokeWidth={1.5} />
            )}
            {gitStatus.upstream_branch ? "Push" : "Publish branch"}
          </button>
        )}
      </div>

      <form
        className="shrink-0 border-t border-border-subtle px-3 pb-2 pt-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (canCommit) void handleCommit();
        }}
      >
        <div className="relative">
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                (event.metaKey || event.ctrlKey) &&
                canCommit
              ) {
                event.preventDefault();
                void handleCommit();
              }
            }}
            placeholder={
              staged.length > 0
                ? `Update ${getFileName(staged[0].path)}`
                : "Stage files to commit"
            }
            rows={2}
            spellCheck={false}
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore
            className="block min-h-10 w-full resize-none bg-transparent py-1 pr-8 text-[13px] leading-5 text-primary caret-accent-primary outline-none placeholder:text-muted"
            aria-label="Commit message"
          />
          <button
            type="button"
            onClick={handleGenerateMessage}
            disabled={isGenerating || staged.length === 0}
            className={cn(
              "absolute right-0 top-0.5 flex h-7 w-7 items-center justify-center rounded transition-colors",
              isGenerating || staged.length === 0
                ? "text-muted cursor-not-allowed"
                : "text-tertiary cursor-pointer hover:bg-hover hover:text-primary active:scale-[0.97]"
            )}
            title="Generate commit message with AI"
            aria-label="Generate commit message with AI"
          >
            {isGenerating ? (
              <Loader className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
          </button>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!canCommit}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded px-2 text-[11px] font-medium transition-colors active:scale-[0.97]",
              canCommit
                ? "cursor-pointer text-secondary hover:bg-hover hover:text-primary"
                : "cursor-not-allowed text-muted"
            )}
          >
            {isCommitting ? (
              <Loader className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <GitCommit className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
            {isCommitting ? "Committing…" : "Commit"}
          </button>
        </div>
      </form>
    </div>
  );
}
