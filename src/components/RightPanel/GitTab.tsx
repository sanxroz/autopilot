import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Plus,
  Minus,
  GitCommit,
  Upload,
  FilePlus,
  FileEdit,
  FileMinus,
  ChevronDown,
  Loader,
  GitBranch,
  Sparkles,
} from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import { useAppStore } from "../../store";
import type { GitStatus, GitStatusFile } from "../../types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
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

function getFileColor(status: string): string {
  const statusLower = status.toLowerCase();
  if (statusLower === "added" || statusLower === "untracked") {
    return "#22C55E";
  }
  if (statusLower === "deleted") {
    return "#EF4444";
  }
  return "#F59E0B";
}

function getFileName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1];
}

export function GitTab({ worktreePath }: GitTabProps) {
  const theme = useTheme();
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStaging, setIsStaging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const defaultAIAgent = useAppStore((state) => state.defaultAIAgent);

  const isOperationInProgress = isStaging || isCommitting || isPushing || isGenerating;

  const fetchStatus = useCallback(async () => {
    if (!worktreePath) {
      setGitStatus(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const status = await invoke<GitStatus>("get_git_status", { worktreePath });
      setGitStatus(status);
    } catch (e) {
      setError(String(e));
      setGitStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [worktreePath]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!worktreePath) return;

    invoke("start_watching_worktree_files", { worktreePath }).catch(console.error);

    const unlistenFileChanged = listen<{ worktree_path: string }>("file-changed", (event) => {
      if (event.payload.worktree_path === worktreePath) {
        fetchStatus();
      }
    });

    const unlistenIndexChanged = listen<{ worktree_path: string }>("git-index-changed", (event) => {
      if (event.payload.worktree_path === worktreePath) {
        fetchStatus();
      }
    });

    return () => {
      invoke("stop_watching_worktree_files", { worktreePath }).catch(console.error);
      unlistenFileChanged.then((fn) => fn());
      unlistenIndexChanged.then((fn) => fn());
    };
  }, [worktreePath, fetchStatus]);

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
      <div
        className="flex-1 flex items-center justify-center text-sm"
        style={{ color: theme.text.tertiary }}
      >
        No worktree selected
      </div>
    );
  }

  if (isLoading && !gitStatus) {
    return (
      <div
        className="flex-1 flex items-center justify-center gap-2 text-sm"
        style={{ color: theme.text.tertiary }}
      >
        <Loader className="w-4 h-4 animate-spin" />
        <span>Loading...</span>
      </div>
    );
  }

  if (error && !gitStatus) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
        <span className="text-sm text-center" style={{ color: theme.text.tertiary }}>
          {error}
        </span>
        <button
          onClick={() => fetchStatus()}
          className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
          style={{ background: theme.bg.tertiary, color: theme.text.primary }}
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
    const color = getFileColor(file.status);
    const fileName = getFileName(file.path);

    return (
      <div
        key={file.path}
        className="flex items-center gap-2 py-1 px-3 transition-colors group"
        style={{ color: theme.text.primary }}
        onMouseEnter={(e) => (e.currentTarget.style.background = theme.bg.hover)}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />
        <span className="text-[13px] flex-1 truncate">{fileName}</span>
        <button
          className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ color: theme.text.tertiary }}
          disabled={isOperationInProgress}
          onClick={(e) => {
            e.stopPropagation();
            if (isStaged) {
              handleUnstageFiles([file.path]);
            } else {
              handleStageFiles([file.path]);
            }
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = theme.text.primary)}
          onMouseLeave={(e) => (e.currentTarget.style.color = theme.text.tertiary)}
        >
          {isStaging ? <Loader className="w-4 h-4 animate-spin" /> : isStaged ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-2"
      >
        <span className="text-[13px]" style={{ color: theme.text.primary }}>
          {totalChanges} Change{totalChanges !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1">
          {unstaged.length > 0 ? (
            <button
              onClick={handleStageAll}
              disabled={isOperationInProgress}
              className="text-[12px] px-2 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ color: theme.text.primary }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = theme.bg.hover;
                e.currentTarget.style.color = theme.text.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = theme.text.primary;
              }}
            >
              {isStaging ? "Staging..." : "Stage All"}
            </button>
          ) : staged.length > 0 ? (
            <button
              onClick={handleUnstageAll}
              disabled={isOperationInProgress}
              className="text-[12px] px-2 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ color: theme.text.primary }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = theme.bg.hover;
                e.currentTarget.style.color = theme.text.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = theme.text.primary;
              }}
            >
              {isStaging ? "Unstaging..." : "Unstage All"}
            </button>
          ) : null}
        </div>
      </div>

      {staged.length > 0 && (
        <div className={cn("overflow-auto", unstaged.length === 0 && "flex-1")}>
          <div
            className="px-3 py-1.5 text-[11px] font-medium tracking-wide"
            style={{ color: theme.text.muted }}
          >
            Staged
          </div>
          {staged.map((file) => renderFileItem(file, true))}
        </div>
      )}

      {unstaged.length > 0 && (
        <div className="flex-1 overflow-auto">
          <div
            className="px-3 py-1.5 text-[11px] font-medium tracking-wide"
            style={{ color: theme.text.muted }}
          >
            Changes
          </div>
          {unstaged.map((file) => renderFileItem(file, false))}
        </div>
      )}

      {totalChanges === 0 && (
        <div
          className="flex-1 flex items-center justify-center text-sm"
          style={{ color: theme.text.tertiary }}
        >
          No changes
        </div>
      )}

      <div
        className="px-3 py-2 flex items-center gap-2"
        style={{ borderTop: `1px solid ${theme.border.subtle}` }}
      >
        <GitBranch className="w-3.5 h-3.5" style={{ color: theme.text.muted }} />
        <span className="text-[12px]" style={{ color: theme.text.primary }}>
          {gitStatus?.branch || "unknown"}
        </span>
        {gitStatus?.upstream_branch && (
          <>
            <span className="text-[12px]" style={{ color: theme.text.muted }}>/</span>
            <span className="text-[12px]" style={{ color: theme.text.tertiary }}>
              {gitStatus.upstream_branch}
            </span>
          </>
        )}
        {gitStatus && gitStatus.ahead > 0 && (
          <button
            onClick={handlePush}
            disabled={isPushing}
            className="ml-auto flex items-center hover:bg-neutral-100 gap-1.5 px-1.5 py-0.5 rounded text-[11px] transition-colors"
            style={{ color: theme.text.primary }}
          >
            {isPushing ? (
              <Loader className="w-3 h-3 animate-spin" />
            ) : (
              <Upload className="w-3 h-3" />
            )}
            Publish
          </button>
        )}
      </div>

      <div
        className="px-3 py-2"
        style={{ borderTop: `1px solid ${theme.border.subtle}` }}
      >
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder={staged.length > 0 ? `Update ${getFileName(staged[0].path)}` : "Message"}
            rows={3}
            className="w-full px-0 py-1 pr-8 text-[13px] resize-none outline-none bg-transparent"
            style={{ color: theme.text.primary }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && canCommit) {
                e.preventDefault();
                handleCommit();
              }
            }}
          />
          <button
            onClick={handleGenerateMessage}
            disabled={isGenerating || staged.length === 0}
            className="absolute top-1 right-0 p-1 rounded transition-colors"
            style={{
              color: isGenerating || staged.length === 0 ? theme.text.muted : theme.text.tertiary,
              cursor: isGenerating || staged.length === 0 ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (!isGenerating && staged.length > 0) {
                e.currentTarget.style.color = theme.accent.primary;
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = isGenerating || staged.length === 0 ? theme.text.muted : theme.text.tertiary;
            }}
            title="Generate commit message with AI"
          >
            {isGenerating ? (
              <Loader className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
        <div className="flex justify-end mt-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={!canCommit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium transition-colors"
                style={{
                  color: canCommit ? theme.text.primary : theme.text.muted,
                  cursor: canCommit ? "pointer" : "not-allowed",
                }}
                onClick={(e) => {
                  if (canCommit) {
                    e.preventDefault();
                    handleCommit();
                  }
                }}
              >
                {isCommitting ? (
                  <Loader className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <GitCommit className="w-3.5 h-3.5" />
                )}
                Commit
                <ChevronDown className="w-3.5 h-3.5 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleCommit} disabled={!canCommit}>
                <GitCommit className="w-3 h-3" />
                <span>Commit</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  if (!worktreePath || !commitMessage.trim()) return;
                  await handleStageAll();
                  await handleCommit();
                }}
                disabled={totalChanges === 0 || !commitMessage.trim()}
              >
                <GitCommit className="w-3 h-3" />
                <span>Commit All</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
