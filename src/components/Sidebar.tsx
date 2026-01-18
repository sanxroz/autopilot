import { useMemo, useState, useCallback, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Plus,
  PackagePlus,
  Sun,
  Moon,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Settings,
  User,
} from "lucide-react";
import { useAppStore } from "../store";
import type { WorktreeInfo } from "../types";
import { NewWorktreeDialog } from "./NewWorktreeDialog";
import { WorktreeItem } from "./WorktreeItem";
import { useTheme, useThemeMode } from "../hooks/useTheme";

const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 288;

function basename(path: string): string {
  const cleaned = path.replace(/\/+$/g, "");
  const parts = cleaned.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || cleaned;
}

export function Sidebar() {
  const {
    repositories,
    addRepository,
    removeRepository,
    selectWorktree,
    selectedWorktree,
    createWorktreeAuto,
    deleteWorktree,
    collapsedRepos,
    toggleRepoCollapsed,
    setThemeMode,
    toggleSettings,
    githubSettings,
  } = useAppStore();
  const theme = useTheme();
  const themeMode = useThemeMode();
  const [showWorktreeDialog, setShowWorktreeDialog] = useState<string | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const repoGroups = useMemo(() => {
    return repositories.map((repo) => ({
      repoName: repo.info.name || basename(repo.info.path),
      repoPath: repo.info.path,
      worktrees: repo.worktrees.filter((wt) => wt.name !== "main"),
    }));
  }, [repositories]);

  const handleAddRepository = async () => {
    setError(null);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Repository",
      });

      if (selected) {
        await addRepository(selected as string);
      }
    } catch (e) {
      console.error("Failed to add repository:", e);
      setError(String(e));
    }
  };

  const handleWorktreeClick = async (worktree: WorktreeInfo) => {
    await selectWorktree(worktree);
  };

  const handleCreateWorktree = async (repoPath: string) => {
    setError(null);
    try {
      const created = await createWorktreeAuto(repoPath);
      if (created) {
        await selectWorktree(created);
      }
    } catch (e) {
      console.error("Failed to create worktree:", e);
      setError(String(e));
    }
  };

  const handleDeleteWorktree = async (
    e: React.MouseEvent,
    repoPath: string,
    worktreeName: string
  ) => {
    e.stopPropagation();
    setError(null);
    try {
      await deleteWorktree(repoPath, worktreeName);
    } catch (e) {
      console.error("Failed to delete worktree:", e);
      setError(String(e));
    }
  };

  const handleRemoveRepository = (e: React.MouseEvent, repoPath: string) => {
    e.stopPropagation();
    removeRepository(repoPath);
  };

  const handleToggleTheme = () => {
    setThemeMode(themeMode === "dark" ? "light" : "dark");
  };

  return (
    <div
      className="relative flex flex-col h-full pt-8 select-none"
      style={{
        width: `${width}px`,
        minWidth: `${MIN_WIDTH}px`,
        maxWidth: `${MAX_WIDTH}px`,
        background: theme.bg.secondary,
        borderRight: `1px solid ${theme.border.default}`,
      }}
    >
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-10 transition-colors"
        style={{
          backgroundColor: isResizing ? theme.border.strong : "transparent",
        }}
      />

      <div
        className="flex-1 overflow-y-auto scrollbar-hide px-2 pb-4"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <div className="flex flex-col gap-1">
          {repoGroups.map((group, groupIndex) => {
            const isCollapsed = collapsedRepos.has(group.repoPath);

            return (
              <div key={group.repoPath} className="w-full min-w-0">
                {groupIndex > 0 && (
                  <div
                    className="h-px -mx-2 w-[calc(100%+1rem)] mt-1.5 mb-1"
                    style={{ background: theme.border.subtle }}
                  />
                )}

                <div
                  className="flex items-center justify-between px-3 py-1.5 mt-0.5 mb-1 group w-full min-w-0 rounded-md cursor-pointer"
                  onClick={() => toggleRepoCollapsed(group.repoPath)}
                  style={{ background: "transparent" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = theme.bg.hover;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="font-departure font-medium truncate min-w-0"
                      style={{ color: theme.text.primary }}
                    >
                      {group.repoName}
                    </span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {isCollapsed ? (
                        <ChevronRight
                          className="h-3 w-3"
                          style={{ color: theme.text.tertiary }}
                        />
                      ) : (
                        <ChevronDown
                          className="h-3 w-3"
                          style={{ color: theme.text.tertiary }}
                        />
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleRemoveRepository(e, group.repoPath)}
                      className="p-1 -m-1 rounded-sm transition-colors"
                      style={{ color: theme.text.tertiary }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = theme.text.primary;
                        e.currentTarget.style.background = theme.bg.hover;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = theme.text.tertiary;
                        e.currentTarget.style.background = "transparent";
                      }}
                      title="Repository settings"
                    >
                      <Settings className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="w-full min-w-0 space-y-1">
                    <button
                      onClick={() => handleCreateWorktree(group.repoPath)}
                      className="w-full h-8 py-3 text-sm gap-2 rounded-md flex items-center justify-start px-3 transition-colors group/button"
                      style={{
                        color: theme.text.secondary,
                        background: "transparent",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = theme.bg.hover;
                        e.currentTarget.style.color = theme.text.primary;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = theme.text.secondary;
                      }}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <Plus className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate text-sm">
                            New workspace
                          </span>
                        </div>
                        <div
                          className="flex-shrink-0 p-1 -m-1 pr-1.5 rounded-sm opacity-0 group-hover/button:opacity-100 transition-opacity"
                          style={{ color: theme.text.tertiary }}
                        >
                          <MoreHorizontal className="h-3 w-3" />
                        </div>
                      </div>
                    </button>

                    {group.worktrees.map((wt) => (
                      <WorktreeItem
                        key={wt.path}
                        worktree={wt}
                        repoPath={group.repoPath}
                        isActive={selectedWorktree?.path === wt.path}
                        onSelect={() => handleWorktreeClick(wt)}
                        onDelete={(e) => handleDeleteWorktree(e, group.repoPath, wt.name)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {repositories.length === 0 && (
            <div
              className="px-4 py-8 text-center text-sm"
              style={{ color: theme.text.secondary }}
            >
              No repositories added yet
            </div>
          )}
        </div>
      </div>

      {error && (
        <div
          className="mx-3 mb-2 p-2 text-xs rounded border"
          style={{
            color: theme.semantic.error,
            background: theme.semantic.errorMuted,
            borderColor: theme.semantic.error,
          }}
        >
          {error}
        </div>
      )}

      <div className="px-3 pb-3">
        <div className="flex items-center gap-0.5 mb-3">
          <button
            onClick={toggleSettings}
            className="p-0.5 rounded-full transition-colors"
            style={{ background: "transparent" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = theme.bg.hover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
            title={githubSettings.ghAuthUser ? `Signed in as ${githubSettings.ghAuthUser}` : "GitHub Setup"}
          >
            {githubSettings.ghAuthUser ? (
              <img
                src={`https://github.com/${githubSettings.ghAuthUser}.png?size=64`}
                alt={githubSettings.ghAuthUser}
                className="w-5 h-5 rounded-full"
              />
            ) : (
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: theme.bg.tertiary }}
              >
                <User className="w-3 h-3" style={{ color: theme.text.tertiary }} />
              </div>
            )}
          </button>

        <div className="flex items-center gap-1">
          <button
            onClick={handleToggleTheme}
            className="p-2 transition-colors rounded-md"
            style={{
              background: "transparent",
              color: theme.text.tertiary,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = theme.bg.hover;
              e.currentTarget.style.color = theme.text.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = theme.text.tertiary;
            }}
          >
            {themeMode === "dark" ? (
              <Sun className="w-4 h-4" strokeWidth={1.5} />
            ) : (
              <Moon className="w-4 h-4" strokeWidth={1.5} />
            )}
          </button>
        </div>

        </div>
        <button
          onClick={handleAddRepository}
          className="px-2 py-1.5 text-sm transition-colors flex items-center gap-2 rounded-md"
          style={{
            background: "transparent",
            color: theme.text.secondary,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = theme.bg.hover;
            e.currentTarget.style.color = theme.text.primary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = theme.text.secondary;
          }}
        >
          <PackagePlus className="w-4 h-4" strokeWidth={2} />
          <span className='font-medium'>Add repository</span>
        </button>
      </div>

      {showWorktreeDialog && (
        <NewWorktreeDialog
          repoPath={showWorktreeDialog}
          onClose={() => setShowWorktreeDialog(null)}
        />
      )}
    </div>
  );
}
