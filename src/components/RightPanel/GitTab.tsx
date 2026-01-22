import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Plus,
  Minus,
  GitCommit,
  Upload,
  Check,
  FilePlus,
  FileEdit,
  FileMinus,
  ChevronDown,
  ChevronRight,
  Loader,
  GitBranch,
} from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import type { GitStatus, GitStatusFile } from "../../types";

interface GitTabProps {
  worktreePath: string | null;
}

function getFileIcon(status: string) {
  const statusLower = status.toLowerCase();
  if (statusLower === "added" || statusLower === "untracked" || statusLower === "new file") {
    return FilePlus;
  }
  if (statusLower === "deleted") {
    return FileMinus;
  }
  return FileEdit;
}

function getFileColor(status: string): string {
  const statusLower = status.toLowerCase();
  if (statusLower === "added" || statusLower === "untracked" || statusLower === "new file") {
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

function getFileDir(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

export function GitTab({ worktreePath }: GitTabProps) {
  const theme = useTheme();
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [unstagedExpanded, setUnstagedExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const handleStageFiles = useCallback(async (files: string[]) => {
    if (!worktreePath || files.length === 0) return;
    
    try {
      await invoke("git_stage_files", { worktreePath, files });
      await fetchStatus();
      setSelectedFiles(new Set());
    } catch (e) {
      setError(String(e));
    }
  }, [worktreePath, fetchStatus]);

  const handleUnstageFiles = useCallback(async (files: string[]) => {
    if (!worktreePath || files.length === 0) return;
    
    try {
      await invoke("git_unstage_files", { worktreePath, files });
      await fetchStatus();
      setSelectedFiles(new Set());
    } catch (e) {
      setError(String(e));
    }
  }, [worktreePath, fetchStatus]);

  const handleStageAll = useCallback(async () => {
    if (!worktreePath) return;
    
    try {
      await invoke("git_stage_all", { worktreePath });
      await fetchStatus();
      setSelectedFiles(new Set());
    } catch (e) {
      setError(String(e));
    }
  }, [worktreePath, fetchStatus]);

  const handleUnstageAll = useCallback(async () => {
    if (!worktreePath) return;
    
    try {
      await invoke("git_unstage_all", { worktreePath });
      await fetchStatus();
      setSelectedFiles(new Set());
    } catch (e) {
      setError(String(e));
    }
  }, [worktreePath, fetchStatus]);

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

  const toggleFileSelection = useCallback((path: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

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

  if (isLoading) {
    return (
      <div
        className="flex-1 flex items-center justify-center gap-2 text-sm"
        style={{ color: theme.text.tertiary }}
      >
        <Loader className="w-4 h-4 animate-spin" />
        <span>Loading status...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
        <span className="text-sm text-center" style={{ color: theme.text.tertiary }}>
          {error}
        </span>
        <button
          onClick={() => fetchStatus()}
          className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
          style={{
            background: theme.bg.tertiary,
            color: theme.text.secondary,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = theme.bg.hover)}
          onMouseLeave={(e) => (e.currentTarget.style.background = theme.bg.tertiary)}
        >
          Try again
        </button>
      </div>
    );
  }

  const staged = gitStatus?.staged || [];
  const unstaged = gitStatus?.unstaged || [];
  const hasChanges = staged.length > 0 || unstaged.length > 0;
  const canCommit = staged.length > 0 && commitMessage.trim().length > 0 && !isCommitting;
  const canPush = gitStatus && gitStatus.ahead > 0 && !isPushing;

  const renderFileItem = (file: GitStatusFile, isStaged: boolean) => {
    const Icon = getFileIcon(file.status);
    const color = getFileColor(file.status);
    const fileName = getFileName(file.path);
    const fileDir = getFileDir(file.path);
    const isSelected = selectedFiles.has(file.path);

    return (
      <div
        key={file.path}
        className="flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer transition-colors group"
        style={{
          background: isSelected ? theme.bg.active : "transparent",
        }}
        onClick={() => toggleFileSelection(file.path)}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.background = theme.bg.hover;
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.background = "transparent";
        }}
      >
        <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
        <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
          <span className="text-[13px] truncate" style={{ color: theme.text.primary }}>
            {fileName}
          </span>
          {fileDir && (
            <span className="text-[11px] truncate" style={{ color: theme.text.muted }}>
              {fileDir}
            </span>
          )}
        </div>
        <button
          className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          style={{ color: theme.text.tertiary }}
          onClick={(e) => {
            e.stopPropagation();
            if (isStaged) {
              handleUnstageFiles([file.path]);
            } else {
              handleStageFiles([file.path]);
            }
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = theme.bg.active;
            e.currentTarget.style.color = theme.text.primary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = theme.text.tertiary;
          }}
        >
          {isStaged ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {gitStatus?.branch && (
        <div
          className="px-3 py-2.5 flex items-center gap-2"
          style={{ borderBottom: `1px solid ${theme.border.subtle}` }}
        >
          <GitBranch className="w-3.5 h-3.5" style={{ color: theme.text.tertiary }} />
          <span className="text-[13px] font-medium" style={{ color: theme.text.primary }}>
            {gitStatus.branch}
          </span>
          {(gitStatus.ahead > 0 || gitStatus.behind > 0) && (
            <div className="flex items-center gap-1.5 ml-auto">
              {gitStatus.ahead > 0 && (
                <span
                  className="text-[11px] px-1.5 py-0.5 rounded"
                  style={{ background: theme.semantic.successMuted, color: theme.semantic.success }}
                >
                  ↑{gitStatus.ahead}
                </span>
              )}
              {gitStatus.behind > 0 && (
                <span
                  className="text-[11px] px-1.5 py-0.5 rounded"
                  style={{ background: theme.semantic.warningMuted, color: theme.semantic.warning }}
                >
                  ↓{gitStatus.behind}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {!hasChanges ? (
          <div
            className="flex flex-col items-center justify-center h-full gap-2 p-8"
            style={{ color: theme.text.tertiary }}
          >
            <Check className="w-8 h-8" style={{ color: theme.text.muted }} />
            <span className="text-sm">Working tree clean</span>
          </div>
        ) : (
          <>
            {staged.length > 0 && (
              <div className="py-2">
                <button
                  className="w-full px-3 py-1.5 flex items-center gap-2 transition-colors"
                  style={{ color: theme.text.secondary }}
                  onClick={() => setStagedExpanded(!stagedExpanded)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = theme.bg.hover)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {stagedExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                  <span className="text-xs font-medium uppercase tracking-wide">
                    Staged Changes
                  </span>
                  <span
                    className="text-[11px] px-1.5 py-0.5 rounded"
                    style={{ background: theme.bg.tertiary, color: theme.text.tertiary }}
                  >
                    {staged.length}
                  </span>
                  <div className="flex-1" />
                  <span
                    className="text-[11px] opacity-0 group-hover:opacity-100"
                    style={{ color: theme.text.muted }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUnstageAll();
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = theme.text.secondary)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = theme.text.muted)}
                  >
                    Unstage All
                  </span>
                </button>
                {stagedExpanded && (
                  <div className="px-1">
                    {staged.map((file) => renderFileItem(file, true))}
                  </div>
                )}
              </div>
            )}

            {unstaged.length > 0 && (
              <div className="py-2">
                <button
                  className="w-full px-3 py-1.5 flex items-center gap-2 transition-colors"
                  style={{ color: theme.text.secondary }}
                  onClick={() => setUnstagedExpanded(!unstagedExpanded)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = theme.bg.hover)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {unstagedExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                  <span className="text-xs font-medium uppercase tracking-wide">Changes</span>
                  <span
                    className="text-[11px] px-1.5 py-0.5 rounded"
                    style={{ background: theme.bg.tertiary, color: theme.text.tertiary }}
                  >
                    {unstaged.length}
                  </span>
                  <div className="flex-1" />
                  <span
                    className="text-[11px] opacity-0 group-hover:opacity-100"
                    style={{ color: theme.text.muted }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStageAll();
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = theme.text.secondary)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = theme.text.muted)}
                  >
                    Stage All
                  </span>
                </button>
                {unstagedExpanded && (
                  <div className="px-1">
                    {unstaged.map((file) => renderFileItem(file, false))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div
        className="p-3 flex flex-col gap-2"
        style={{ borderTop: `1px solid ${theme.border.subtle}` }}
      >
        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Commit message..."
          rows={3}
          className="w-full px-3 py-2 rounded text-[13px] resize-none outline-none transition-colors"
          style={{
            background: theme.bg.secondary,
            color: theme.text.primary,
            border: `1px solid ${theme.border.default}`,
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = theme.accent.primary)}
          onBlur={(e) => (e.currentTarget.style.borderColor = theme.border.default)}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleCommit}
            disabled={!canCommit}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-[13px] font-medium transition-all"
            style={{
              background: canCommit ? theme.accent.primary : theme.bg.tertiary,
              color: canCommit ? theme.bg.primary : theme.text.muted,
              opacity: canCommit ? 1 : 0.6,
              cursor: canCommit ? "pointer" : "not-allowed",
            }}
            onMouseEnter={(e) => {
              if (canCommit) e.currentTarget.style.background = theme.accent.hover;
            }}
            onMouseLeave={(e) => {
              if (canCommit) e.currentTarget.style.background = theme.accent.primary;
            }}
          >
            {isCommitting ? (
              <Loader className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <GitCommit className="w-3.5 h-3.5" />
            )}
            <span>Commit</span>
          </button>
          {canPush && (
            <button
              onClick={handlePush}
              disabled={isPushing}
              className="flex items-center justify-center gap-2 px-3 py-2 rounded text-[13px] font-medium transition-colors"
              style={{
                background: theme.bg.tertiary,
                color: theme.text.secondary,
                cursor: isPushing ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = theme.bg.hover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = theme.bg.tertiary)}
            >
              {isPushing ? (
                <Loader className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span>Push</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
