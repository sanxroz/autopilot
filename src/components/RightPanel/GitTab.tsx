import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Plus,
  Minus,
  RotateCcw,
  GitCommit,
  Upload,
  FilePlus,
  FileEdit,
  FileMinus,
  Loader,
  GitBranch,
  Sparkles,
} from "lucide-react";
import { useAppStore } from "../../store";
import type { GitStatus, GitStatusFile } from "../../types";

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshAgainRef = useRef(false);
  const activeFetchIdRef = useRef(0);
  const inFlightWorktreePathRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const latestWorktreePathRef = useRef(worktreePath);
  const defaultAIAgent = useAppStore((state) => state.defaultAIAgent);
  const gitFileDiffPreview = useAppStore((state) => state.gitFileDiffPreview);
  const setGitFileDiffPreview = useAppStore((state) => state.setGitFileDiffPreview);

  const isOperationInProgress =
    isStaging || revertingFile !== null || isCommitting || isPushing || isGenerating;

  latestWorktreePathRef.current = worktreePath;

  const fetchStatus = useCallback(async () => {
    if (!isMountedRef.current) return;

    if (!worktreePath) {
      refreshInFlightRef.current = false;
      inFlightWorktreePathRef.current = null;
      refreshAgainRef.current = false;
      setIsLoading(false);
      setGitStatus(null);
      return;
    }

    if (refreshInFlightRef.current) {
      if (inFlightWorktreePathRef.current === worktreePath) {
        refreshAgainRef.current = true;
        return;
      }

      activeFetchIdRef.current += 1;
      refreshInFlightRef.current = false;
      refreshAgainRef.current = false;
    }

    const fetchId = activeFetchIdRef.current + 1;
    activeFetchIdRef.current = fetchId;
    refreshInFlightRef.current = true;
    inFlightWorktreePathRef.current = worktreePath;
    setIsLoading(true);
    setError(null);

    try {
      const status = await invoke<GitStatus>("get_git_status", { worktreePath });
      if (
        !isMountedRef.current ||
        activeFetchIdRef.current !== fetchId ||
        latestWorktreePathRef.current !== worktreePath
      ) {
        return;
      }
      setGitStatus(status);
    } catch (e) {
      if (
        !isMountedRef.current ||
        activeFetchIdRef.current !== fetchId ||
        latestWorktreePathRef.current !== worktreePath
      ) {
        return;
      }
      setError(String(e));
      setGitStatus(null);
    } finally {
      if (
        !isMountedRef.current ||
        activeFetchIdRef.current !== fetchId ||
        latestWorktreePathRef.current !== worktreePath
      ) {
        return;
      }
      refreshInFlightRef.current = false;
      inFlightWorktreePathRef.current = null;
      setIsLoading(false);
      if (refreshAgainRef.current) {
        refreshAgainRef.current = false;
        if (refreshTimerRef.current) {
          clearTimeout(refreshTimerRef.current);
        }
        refreshTimerRef.current = setTimeout(() => {
          refreshTimerRef.current = null;
          fetchStatus();
        }, 500);
      }
    }
  }, [worktreePath]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      activeFetchIdRef.current += 1;
    };
  }, []);

  const scheduleStatusRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      fetchStatus();
    }, 500);
  }, [fetchStatus]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!worktreePath) return;

    invoke("start_watching_worktree_files", { worktreePath }).catch(console.error);

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
      invoke("stop_watching_worktree_files", { worktreePath }).catch(console.error);
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
      setGitFileDiffPreview({ filePath: file.path, worktreePath, isStaged });
    }
  }, [worktreePath, gitFileDiffPreview, setGitFileDiffPreview]);

  const handleStageFiles = useCallback(async (files: string[]) => {
    if (!worktreePath || files.length === 0 || isOperationInProgress) return;
    setIsStaging(true);
    try {
      await invoke("git_stage_files", { worktreePath, files });
      await fetchStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsStaging(false);
    }
  }, [worktreePath, fetchStatus, isOperationInProgress]);

  const handleUnstageFiles = useCallback(async (files: string[]) => {
    if (!worktreePath || files.length === 0 || isOperationInProgress) return;
    setIsStaging(true);
    try {
      await invoke("git_unstage_files", { worktreePath, files });
      await fetchStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsStaging(false);
    }
  }, [worktreePath, fetchStatus, isOperationInProgress]);

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
        await fetchStatus();
      } catch (e) {
        setError(String(e));
      } finally {
        setRevertingFile(null);
      }
    },
    [worktreePath, fetchStatus, isOperationInProgress]
  );

  const handleStageAll = useCallback(async () => {
    if (!worktreePath || isOperationInProgress) return;
    setIsStaging(true);
    try {
      await invoke("git_stage_all", { worktreePath });
      await fetchStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsStaging(false);
    }
  }, [worktreePath, fetchStatus, isOperationInProgress]);

  const handleUnstageAll = useCallback(async () => {
    if (!worktreePath || isOperationInProgress) return;
    setIsStaging(true);
    try {
      await invoke("git_unstage_all", { worktreePath });
      await fetchStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsStaging(false);
    }
  }, [worktreePath, fetchStatus, isOperationInProgress]);

  const handleCommit = useCallback(async () => {
    if (!worktreePath || !commitMessage.trim()) return;
    setIsCommitting(true);
    setError(null);
    try {
      await invoke<string>("git_commit", { worktreePath, message: commitMessage.trim() });
      setCommitMessage("");
      await fetchStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsCommitting(false);
    }
  }, [worktreePath, commitMessage, fetchStatus]);

  const handlePush = useCallback(async () => {
    if (!worktreePath) return;
    setIsPushing(true);
    setError(null);
    try {
      await invoke("git_push", { worktreePath });
      await fetchStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsPushing(false);
    }
  }, [worktreePath, fetchStatus]);

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
          onClick={() => fetchStatus()}
          className="px-3 py-1.5 rounded text-xs font-medium transition-colors bg-tertiary text-primary"
        >
          Try again
        </button>
      </div>
    );
  }

  const staged = gitStatus?.staged || [];
  const unstaged = gitStatus?.unstaged || [];
  const totalChanges = staged.length + unstaged.length;
  const canCommit = staged.length > 0 && commitMessage.trim().length > 0 && !isCommitting;

  const renderFileItem = (file: GitStatusFile, isStaged: boolean) => {
    const Icon = getFileIcon(file.status);
    const colorClass = getFileColorClass(file.status);
    const fileName = getFileName(file.path);
    const isSelected = gitFileDiffPreview?.filePath === file.path && gitFileDiffPreview?.isStaged === isStaged;

    return (
      <div
        key={file.path}
        className={cn(
          "flex items-center gap-2 py-1 px-3 transition-colors group cursor-pointer text-primary",
          isSelected ? "bg-active" : "bg-transparent hover:bg-hover"
        )}
        onClick={() => handleSelectFile(file, isStaged)}
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
        <Icon className={cn("w-4 h-4 flex-shrink-0", colorClass)} />
        <span className="text-[13px] flex-1 truncate">{fileName}</span>
        <div
          className={cn(
            "flex items-center gap-1 flex-shrink-0 transition-opacity",
            isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          <button
            className="p-0.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-tertiary hover:text-primary"
            disabled={isOperationInProgress}
            onClick={(e) => {
              e.stopPropagation();
              void handleRevertFile(file, isStaged);
            }}
            aria-label={`Revert ${fileName}`}
            title={`Revert ${fileName}`}
          >
            {revertingFile === file.path ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            className="p-0.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-tertiary hover:text-primary"
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
              <Loader className="w-4 h-4 animate-spin" />
            ) : isStaged ? (
              <Minus className="w-4 h-4" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[13px] text-primary">
          {totalChanges} Change{totalChanges !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1">
          {unstaged.length > 0 ? (
            <button
              onClick={handleStageAll}
              disabled={isOperationInProgress}
              className="text-[12px] px-2 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-primary hover:bg-hover"
            >
              {isStaging ? "Staging..." : "Stage All"}
            </button>
          ) : staged.length > 0 ? (
            <button
              onClick={handleUnstageAll}
              disabled={isOperationInProgress}
              className="text-[12px] px-2 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-primary hover:bg-hover"
            >
              {isStaging ? "Unstaging..." : "Unstage All"}
            </button>
          ) : null}
        </div>
      </div>

      {staged.length > 0 && (
        <div className={cn("overflow-auto", unstaged.length === 0 && "flex-1")}>
          <div className="px-3 py-1.5 text-[11px] font-medium tracking-wide text-muted">
            Staged
          </div>
          {staged.map((file) => renderFileItem(file, true))}
        </div>
      )}

      {unstaged.length > 0 && (
        <div className="flex-1 overflow-auto">
          <div className="px-3 py-1.5 text-[11px] font-medium tracking-wide text-muted">
            Changes
          </div>
          {unstaged.map((file) => renderFileItem(file, false))}
        </div>
      )}

      {totalChanges === 0 && (
        <div className="flex-1 flex items-center justify-center text-sm text-tertiary">
          No changes
        </div>
      )}

      <div className="px-3 py-2 flex items-center gap-2 border-t border-subtle">
        <GitBranch className="w-3.5 h-3.5 text-muted" />
        <span className="text-[12px] text-primary">
          {gitStatus?.branch || "unknown"}
        </span>
        {gitStatus && (gitStatus.ahead > 0 || !gitStatus.upstream_branch) && (
          <button
            onClick={handlePush}
            disabled={isPushing}
            className="ml-auto flex items-center hover:bg-hover gap-1.5 px-1.5 py-0.5 rounded text-[11px] transition-colors text-primary"
          >
            {isPushing ? (
              <Loader className="w-3 h-3 animate-spin" />
            ) : (
              <Upload className="w-3 h-3" />
            )}
            {gitStatus.upstream_branch ? "Push" : "Publish Branch"}
          </button>
        )}
      </div>

      <div className="px-3 py-2 border-t border-subtle">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder={staged.length > 0 ? `Update ${getFileName(staged[0].path)}` : "Message"}
            rows={3}
            className="w-full px-0 py-1 pr-8 text-[13px] resize-none outline-none bg-transparent text-primary placeholder:text-muted"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && canCommit) {
                e.preventDefault();
                handleCommit();
              }
            }}
            aria-label="Commit message"
          />
          <button
            onClick={handleGenerateMessage}
            disabled={isGenerating || staged.length === 0}
            className={cn(
              "absolute top-1 right-0 p-1 rounded transition-colors",
              isGenerating || staged.length === 0
                ? "text-muted cursor-not-allowed"
                : "text-tertiary cursor-pointer hover:text-accent-primary"
            )}
            title="Generate commit message with AI"
            aria-label="Generate commit message with AI"
          >
            {isGenerating ? (
              <Loader className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
        <div className="flex justify-end mt-2">
          <button
            onClick={handleCommit}
            disabled={!canCommit}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium transition-colors",
              canCommit ? "text-primary cursor-pointer" : "text-muted cursor-not-allowed"
            )}
          >
            {isCommitting ? (
              <Loader className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <GitCommit className="w-3.5 h-3.5" />
            )}
            Commit
          </button>
        </div>
      </div>
    </div>
  );
}
