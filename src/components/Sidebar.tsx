import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useReducedMotion } from "framer-motion";
import {
  Plus,
  PackagePlus,
  Sun,
  Moon,
  ChevronDown,
  ChevronRight,
  Archive,
  User,
  Folder,
} from "lucide-react";
import { useAppStore } from "../store";
import type { WorktreeInfo } from "../types";
import { NewWorktreeDialog } from "./NewWorktreeDialog";
import { WorktreeItem } from "./WorktreeItem";
import { useThemeMode } from "../hooks/useTheme";
import { cn } from "../utils/cn";

const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 288;

function basename(path: string): string {
  const cleaned = path.replace(/\/+$/g, "");
  const parts = cleaned.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || cleaned;
}

interface SidebarProps {
  isOpen: boolean;
}

export function Sidebar({ isOpen }: SidebarProps) {
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
    prStatusByBranch,
    processStatusByPath,
  } = useAppStore();
  const themeMode = useThemeMode();
  const reducedMotion = useReducedMotion();
  const [showWorktreeDialog, setShowWorktreeDialog] = useState<string | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(DEFAULT_WIDTH);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    widthRef.current = width;
    setIsResizing(true);
  }, [width]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
      widthRef.current = newWidth;
      if (containerRef.current) {
        containerRef.current.style.width = `${newWidth}px`;
      }
      if (innerRef.current) {
        innerRef.current.style.width = `${newWidth}px`;
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setWidth(widthRef.current);
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
      avatarUrl: repo.info.avatarUrl,
      worktrees: repo.worktrees
        .filter((wt) => wt.name !== "main")
        .sort((a, b) => {
          const aTime = a.last_modified ? new Date(a.last_modified).getTime() : 0;
          const bTime = b.last_modified ? new Date(b.last_modified).getTime() : 0;
          return bTime - aTime;
        }),
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
      ref={containerRef}
      className={cn(
        "relative flex-shrink-0 h-full overflow-hidden",
        isOpen ? "pointer-events-auto" : "pointer-events-none"
      )}
      style={{
        width: isOpen ? `${width}px` : 0,
        minWidth: isOpen ? `${MIN_WIDTH}px` : 0,
        maxWidth: `${MAX_WIDTH}px`,
        transition: reducedMotion || isResizing ? "none" : "width 0.2s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <div
        ref={innerRef}
        className="flex flex-col h-full pt-8 select-none bg-secondary border-r border-border"
        style={{
          width: `${width}px`,
          minWidth: `${MIN_WIDTH}px`,
          maxWidth: `${MAX_WIDTH}px`,
        }}
      >
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          "absolute top-0 right-0 w-1 h-full cursor-col-resize z-10 transition-colors",
          isResizing ? "bg-border-strong" : "bg-transparent"
        )}
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
                  <div className="h-px -mx-2 w-[calc(100%+1rem)] mt-1.5 mb-1 bg-border-subtle" />
                )}

                <div
                   className="flex items-center justify-between px-3 py-1.5 mt-0.5 mb-1 group w-full min-w-0 rounded-md cursor-pointer bg-transparent hover:bg-hover"
                   role="button"
                   tabIndex={0}
                   onClick={() => toggleRepoCollapsed(group.repoPath)}
                   onKeyDown={(e) => {
                     if (e.target !== e.currentTarget) return;
                     if (e.key === "Enter" || e.key === " ") {
                       e.preventDefault();
                       toggleRepoCollapsed(group.repoPath);
                     }
                   }}
                    aria-expanded={!isCollapsed}
                    aria-label={`${group.repoName} repository, ${isCollapsed ? "collapsed" : "expanded"}`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {group.avatarUrl ? (
                        <img
                          src={group.avatarUrl}
                          alt={group.repoName}
                          className="h-3.5 w-3.5 rounded-sm flex-shrink-0"
                        />
                      ) : (
                        <Folder className="h-3.5 w-3.5 text-tertiary flex-shrink-0" />
                      )}
                      <span className="font-medium text-sm truncate min-w-0 text-primary">
                        {group.repoName}
                      </span>
                     <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                       {isCollapsed ? (
                         <ChevronRight className="h-3.5 w-3.5 text-tertiary" />
                       ) : (
                         <ChevronDown className="h-3.5 w-3.5 text-tertiary" />
                       )}
                     </span>
                   </div>
                   <div className="flex items-center gap-2.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreateWorktree(group.repoPath);
                        }}
                        className="p-1 -m-1 rounded-sm transition-colors text-tertiary hover:text-primary hover:bg-hover"
                        title="New workspace"
                        aria-label="Create new workspace"
                      >
                       <Plus className="h-3.5 w-3.5" />
                     </button>
                      <button
                        onClick={(e) => handleRemoveRepository(e, group.repoPath)}
                        className="p-1 -m-1 rounded-sm transition-colors text-tertiary hover:text-primary hover:bg-hover"
                        title="Archive repository"
                        aria-label="Archive repository"
                      >
                       <Archive className="h-3.5 w-3.5" />
                     </button>
                   </div>
                 </div>

                {!isCollapsed && (
                   <div className="w-full min-w-0 space-y-1">
                     {group.worktrees.map((wt) => {
                       const prStatus = wt.branch ? prStatusByBranch[group.repoPath]?.[wt.branch] ?? null : null;
                       const processStatus = processStatusByPath[wt.path] || 'none';
                       return (
                         <WorktreeItem
                           key={wt.path}
                           name={wt.name}
                           branch={wt.branch}
                           lastModified={wt.last_modified}
                           diffStats={wt.diff_stats}
                           prStatus={prStatus}
                           processStatus={processStatus}
                           isActive={selectedWorktree?.path === wt.path}
                           onSelect={() => handleWorktreeClick(wt)}
                           onDelete={(e) => handleDeleteWorktree(e, group.repoPath, wt.name)}
                         />
                       );
                     })}
                  </div>
                )}
              </div>
            );
          })}

          {repositories.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-secondary">
              No repositories added yet
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-3 mb-2 p-2 text-xs rounded border text-semantic-error bg-semantic-error-muted border-semantic-error">
          {error}
        </div>
      )}

      <div className="px-3 pb-3">
        <div className="flex items-center gap-0.5 mb-3">
          <button
            onClick={toggleSettings}
            className="p-0.5 rounded-full transition-colors bg-transparent hover:bg-hover"
            title={githubSettings.ghAuthUser ? `Signed in as ${githubSettings.ghAuthUser}` : "GitHub Setup"}
            aria-label={githubSettings.ghAuthUser ? `Account settings for ${githubSettings.ghAuthUser}` : "GitHub Setup"}
          >
            {githubSettings.ghAuthUser ? (
              <img
                src={`https://github.com/${githubSettings.ghAuthUser}.png?size=64`}
                alt={githubSettings.ghAuthUser}
                className="w-5 h-5 rounded-full"
              />
            ) : (
              <div className="w-5 h-5 rounded-full flex items-center justify-center bg-tertiary">
                <User className="w-3.5 h-3.5 text-tertiary" />
              </div>
            )}
          </button>

        <div className="flex items-center gap-1">
          <button
            onClick={handleToggleTheme}
            className="p-2 transition-colors rounded-md bg-transparent text-tertiary hover:bg-hover hover:text-primary"
            aria-label={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {themeMode === "dark" ? (
              <Sun className="w-3.5 h-3.5" />
            ) : (
              <Moon className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        </div>
        <button
          onClick={handleAddRepository}
          className="px-2 py-1.5 text-sm transition-colors flex items-center gap-2 rounded-md bg-transparent text-secondary hover:bg-hover hover:text-primary"
        >
          <PackagePlus className="w-3.5 h-3.5" />
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
    </div>
  );
}
