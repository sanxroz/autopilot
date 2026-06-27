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
import { StackGroup } from "./StackGroup";
import { detectStacks, getStackLabel } from "../lib/pr-stacks";
import { useThemeMode } from "../hooks/useTheme";
import { cn } from "../utils/cn";
import { isWorktreeSettingUp } from "../store/worktreeSetup";

const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 288;
const DRAG_START_THRESHOLD_PX = 10;

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
    reorderWorktrees,
    setThemeMode,
    toggleSettings,
    githubSettings,
    prStatusByBranch,
    processStatusByPath,
    agentRunByWorktreePath,
    agentSidebarLifecycleEnabled,
    worktreeSetupByRepoPath,
  } = useAppStore();
  const themeMode = useThemeMode();
  const reducedMotion = useReducedMotion();
  const [showWorktreeDialog, setShowWorktreeDialog] = useState<string | null>(
    null
  );
  const [failedAvatarUrls, setFailedAvatarUrls] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(DEFAULT_WIDTH);
  const [draggedWorktree, setDraggedWorktree] = useState<{
    repoPath: string;
    worktreePath: string;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    repoPath: string;
    worktreePath: string;
    position: "before" | "after";
  } | null>(null);
  const [isReorderPointerActive, setIsReorderPointerActive] = useState(false);
  const dragSessionRef = useRef<{
    repoPath: string;
    worktreePath: string;
    startX: number;
    startY: number;
    isDragging: boolean;
  } | null>(null);
  const draggedWorktreeRef = useRef<typeof draggedWorktree>(null);
  const dropTargetRef = useRef<typeof dropTarget>(null);
  const suppressNextWorktreeClickRef = useRef(false);

  const setCurrentDraggedWorktree = (value: typeof draggedWorktree) => {
    draggedWorktreeRef.current = value;
    setDraggedWorktree(value);
  };

  const setCurrentDropTarget = (value: typeof dropTarget) => {
    const current = dropTargetRef.current;
    if (
      current?.repoPath === value?.repoPath &&
      current?.worktreePath === value?.worktreePath &&
      current?.position === value?.position
    ) {
      return;
    }

    dropTargetRef.current = value;
    setDropTarget(value);
  };

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
    if (suppressNextWorktreeClickRef.current) {
      suppressNextWorktreeClickRef.current = false;
      return;
    }

    await selectWorktree(worktree);
  };

  const handleCreateWorktree = async (repoPath: string) => {
    setError(null);
    try {
      const created = await createWorktreeAuto(repoPath);
      if (created) {
        window.setTimeout(() => {
          void selectWorktree(created);
        }, 0);
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

  const handleWorktreePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    repoPath: string,
    worktreePath: string
  ) => {
    const target = e.target as HTMLElement;
    if (e.button !== 0 || target.closest("button")) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    dragSessionRef.current = {
      repoPath,
      worktreePath,
      startX: e.clientX,
      startY: e.clientY,
      isDragging: false,
    };
    setCurrentDropTarget(null);
    setIsReorderPointerActive(true);
  };

  const endWorktreeDrag = () => {
    dragSessionRef.current = null;
    setCurrentDraggedWorktree(null);
    setCurrentDropTarget(null);
    setIsReorderPointerActive(false);
  };

  useEffect(() => {
    if (!isReorderPointerActive) return;

    const handlePointerMove = (e: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;

      if (!session.isDragging) {
        const deltaX = Math.abs(e.clientX - session.startX);
        const deltaY = Math.abs(e.clientY - session.startY);

        if (Math.max(deltaX, deltaY) < DRAG_START_THRESHOLD_PX) {
          return;
        }

        session.isDragging = true;
        setCurrentDraggedWorktree({
          repoPath: session.repoPath,
          worktreePath: session.worktreePath,
        });
      }

      const currentDrag = draggedWorktreeRef.current;
      if (!currentDrag) return;

      const target = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>("[data-worktree-drop-target='true']");

      if (!target) {
        setCurrentDropTarget(null);
        return;
      }

      const repoPath = target.dataset.repoPath;
      const worktreePath = target.dataset.worktreePath;
      if (
        !repoPath ||
        !worktreePath ||
        repoPath !== currentDrag.repoPath ||
        worktreePath === currentDrag.worktreePath
      ) {
        setCurrentDropTarget(null);
        return;
      }

      const bounds = target.getBoundingClientRect();
      const position = e.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
      setCurrentDropTarget({ repoPath, worktreePath, position });
    };

    const handlePointerUp = async () => {
      const currentDrag = draggedWorktreeRef.current;
      const currentDrop = dropTargetRef.current;

      if (!dragSessionRef.current?.isDragging) {
        const clickSession = dragSessionRef.current;
        endWorktreeDrag();
        if (clickSession) {
          const repo = useAppStore
            .getState()
            .repositories.find((item) => item.info.path === clickSession.repoPath);
          const worktree = repo?.worktrees.find((item) => item.path === clickSession.worktreePath);

          if (worktree) {
            suppressNextWorktreeClickRef.current = true;
            window.setTimeout(() => {
              suppressNextWorktreeClickRef.current = false;
            }, 250);
            await selectWorktree(worktree);
          }
        }
        return;
      }

      suppressNextWorktreeClickRef.current = true;
      window.setTimeout(() => {
        suppressNextWorktreeClickRef.current = false;
      }, 250);

      if (
        !currentDrag ||
        !currentDrop ||
        currentDrag.repoPath !== currentDrop.repoPath ||
        currentDrag.worktreePath === currentDrop.worktreePath
      ) {
        endWorktreeDrag();
        return;
      }

      const repo = useAppStore
        .getState()
        .repositories.find((item) => item.info.path === currentDrop.repoPath);
      if (!repo) {
        endWorktreeDrag();
        return;
      }

      const currentOrder = repo.worktrees
        .filter((wt) => wt.name !== "main")
        .map((wt) => wt.path)
        .filter((path) => path !== currentDrag.worktreePath);
      const targetIndex = currentOrder.indexOf(currentDrop.worktreePath);

      if (targetIndex === -1) {
        endWorktreeDrag();
        return;
      }

      currentOrder.splice(
        targetIndex + (currentDrop.position === "after" ? 1 : 0),
        0,
        currentDrag.worktreePath
      );

      await reorderWorktrees(currentDrop.repoPath, currentOrder);
      endWorktreeDrag();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", endWorktreeDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", endWorktreeDrag);
    };
  }, [isReorderPointerActive, reorderWorktrees]);

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
            const avatarUrl = group.avatarUrl;
            const showAvatar = avatarUrl !== undefined && !failedAvatarUrls.has(avatarUrl);

            return (
              <div key={group.repoPath} className="w-full min-w-0">
                {groupIndex > 0 && (
                  <div className="h-px -mx-2 w-[calc(100%+1rem)] mt-1.5 mb-1 bg-border-subtle" />
                )}

<div
                    className="flex items-center justify-between px-3 py-1.5 mt-0.5 mb-1 group w-full min-w-0 rounded-md cursor-pointer bg-secondary hover:bg-hover transition-colors duration-200"
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
                      {showAvatar ? (
                        <img
                          src={avatarUrl}
                          alt={group.repoName}
                          className="h-3.5 w-3.5 rounded-sm flex-shrink-0"
                          onError={() => {
                            setFailedAvatarUrls((prev) => {
                              if (!avatarUrl) return prev;
                              const next = new Set(prev);
                              next.add(avatarUrl);
                              return next;
                            });
                          }}
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
                     {(() => {
                       const repoPrs = prStatusByBranch[group.repoPath] ?? {};
                       const { stacks, standalone } = detectStacks(repoPrs);
                       const standaloneBranches = new Set(standalone.map((p) => p.head_branch));

                       const stackWts: { stackIndex: number; wt: WorktreeInfo }[] = [];
                       const soloWts: WorktreeInfo[] = [];

                       for (const wt of group.worktrees) {
                         const pr = wt.branch ? repoPrs[wt.branch] : undefined;
                         if (!pr || standaloneBranches.has(pr.head_branch)) {
                           soloWts.push(wt);
                         } else {
                           const idx = stacks.findIndex((s) =>
                             s.allPrs.some((sp) => sp.head_branch === pr.head_branch)
                           );
                           if (idx >= 0) stackWts.push({ stackIndex: idx, wt });
                           else soloWts.push(wt);
                         }
                       }

                       const stackGroups = new Map<number, WorktreeInfo[]>();
                       for (const { stackIndex, wt } of stackWts) {
                         if (!stackGroups.has(stackIndex)) stackGroups.set(stackIndex, []);
                         stackGroups.get(stackIndex)!.push(wt);
                       }

                       const renderItem = (wt: WorktreeInfo) => {
                         const prStatus = wt.branch ? prStatusByBranch[group.repoPath]?.[wt.branch] ?? null : null;
                         const processStatus = processStatusByPath[wt.path] || 'none';
                         const agentRunState = agentSidebarLifecycleEnabled ? agentRunByWorktreePath[wt.path] : undefined;
                         const isDragSource = draggedWorktree?.worktreePath === wt.path;
                         const showDropBefore = dropTarget?.repoPath === group.repoPath && dropTarget.worktreePath === wt.path && dropTarget.position === "before";
                         const showDropAfter = dropTarget?.repoPath === group.repoPath && dropTarget.worktreePath === wt.path && dropTarget.position === "after";

                         return (
                           <div
                             key={wt.path}
                             data-worktree-drop-target="true"
                             data-repo-path={group.repoPath}
                             data-worktree-path={wt.path}
                             onPointerDown={(e) => handleWorktreePointerDown(e, group.repoPath, wt.path)}
                             className={cn("relative", isReorderPointerActive && "select-none")}
                           >
                             {showDropBefore && (
                               <div className="absolute inset-x-2 top-0 h-0.5 rounded-full bg-border-strong" />
                             )}
                             <WorktreeItem
                               name={wt.name}
                               branch={wt.branch}
                               lastModified={wt.last_modified}
                               diffStats={wt.diff_stats}
                               prStatus={prStatus}
                               processStatus={processStatus}
                               agentRunState={agentRunState}
                               isSettingUp={isWorktreeSettingUp(worktreeSetupByRepoPath, group.repoPath, wt.name)}
                               isActive={selectedWorktree?.path === wt.path}
                               onSelect={() => handleWorktreeClick(wt)}
                               onDelete={(e) => handleDeleteWorktree(e, group.repoPath, wt.name)}
                               className={cn(
                                 draggedWorktree ? "cursor-grabbing" : "cursor-pointer",
                                 isDragSource && "opacity-60"
                               )}
                             />
                             {showDropAfter && (
                               <div className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-border-strong" />
                             )}
                           </div>
                         );
                       };

                       const elements: React.ReactNode[] = [];

                       for (const [stackIndex, wts] of stackGroups) {
                         const stack = stacks[stackIndex];
                         const prOrder = new Map(
                           stack.allPrs.map((pr, index) => [pr.head_branch, index] as const)
                         );
                         const orderedWts = [...wts].sort((a, b) => {
                           const aIndex = a.branch ? prOrder.get(a.branch) ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
                           const bIndex = b.branch ? prOrder.get(b.branch) ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
                           return aIndex - bIndex;
                         });
                         elements.push(
                            <StackGroup key={`stack-${stackIndex}`} label={getStackLabel(stack)} count={stack.allPrs.length}>
                             {orderedWts.map(renderItem)}
                           </StackGroup>
                         );
                       }

                        for (const wt of soloWts) {
                          elements.push(renderItem(wt));
                        }

                        return elements;
                     })()}
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
