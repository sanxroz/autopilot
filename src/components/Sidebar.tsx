import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Plus,
  Sun,
  Moon,
  Archive,
  Ellipsis,
  User,
  Folder,
  SquareTerminal,
} from "lucide-react";
import { useAppStore } from "../store";
import type { WorktreeInfo } from "../types";
import { NewWorktreeDialog } from "./NewWorktreeDialog";
import { WorktreeItem } from "./WorktreeItem";
import { StackGroup } from "./StackGroup";
import { SidebarWorktreeGroup } from "./SidebarWorktreeGroup";
import { detectStacks, getStackLabel } from "../lib/pr-stacks";
import { useThemeMode } from "../hooks/useTheme";
import { cn } from "../utils/cn";
import { beginPanelResize, endPanelResize } from "../utils/panelResize";
import { isWorktreeSettingUp } from "../store/worktreeSetup";
import type { SidebarWorktreeGroup as SidebarWorktreeGroupModel } from "../lib/sidebar-groups";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  findSpaceForWorktree,
  loadActiveSpace,
  resolveActiveSpace,
  saveActiveSpace,
} from "../lib/spaces";

const MIN_WIDTH = 240;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 312;
const DRAG_START_THRESHOLD_PX = 10;
const GROUP_HOLD_DELAY_MS = 1200;

function basename(path: string): string {
  const cleaned = path.replace(/\/+$/g, "");
  const parts = cleaned.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || cleaned;
}

interface SidebarProps {
  isOpen: boolean;
  captainTerminalRepoPath: string | null;
  onToggleCaptainTerminal: (repoPath: string) => void;
}

export function Sidebar({
  isOpen,
  captainTerminalRepoPath,
  onToggleCaptainTerminal,
}: SidebarProps) {
  const {
    repositories,
    addRepository,
    removeRepository,
    selectWorktree,
    selectedWorktree,
    createWorktreeAuto,
    deleteWorktree,
    createSidebarGroup,
    moveWorktreeInSidebar,
    renameSidebarGroup,
    setThemeMode,
    toggleSettings,
    githubSettings,
    prStatusByBranch,
    prStatusByWorktreePath,
    processStatusByPath,
    agentRunByWorktreePath,
    agentSidebarLifecycleEnabled,
    worktreeSetupByRepoPath,
    sidebarGroupsByRepo,
  } = useAppStore();
  const themeMode = useThemeMode();
  const [showWorktreeDialog, setShowWorktreeDialog] = useState<string | null>(
    null
  );
  const [failedAvatarUrls, setFailedAvatarUrls] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [activeSpacePath, setActiveSpacePath] = useState<string | null>(
    loadActiveSpace,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(DEFAULT_WIDTH);
  const pendingWidthRef = useRef(DEFAULT_WIDTH);
  const resizeFrameRef = useRef<number | null>(null);
  const [draggedWorktree, setDraggedWorktree] = useState<{
    repoPath: string;
    worktreePath: string;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    repoPath: string;
    kind: "worktree" | "group";
    worktreePath?: string;
    groupId?: string;
    position?: "before" | "after" | "inside";
  } | null>(null);
  const [groupingTarget, setGroupingTarget] = useState<{
    repoPath: string;
    worktreePath: string;
  } | null>(null);
  const [editingGroup, setEditingGroup] = useState<{
    repoPath: string;
    groupId: string;
    value: string;
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
  const groupingTargetRef = useRef<typeof groupingTarget>(null);
  const groupHoverTimerRef = useRef<number | null>(null);
  const groupHoverCandidateRef = useRef<{
    repoPath: string;
    worktreePath: string;
  } | null>(null);
  const suppressNextWorktreeClickRef = useRef(false);

  const setCurrentDraggedWorktree = (value: typeof draggedWorktree) => {
    draggedWorktreeRef.current = value;
    setDraggedWorktree(value);
  };

  const setCurrentDropTarget = (value: typeof dropTarget) => {
    const current = dropTargetRef.current;
    if (
      current?.kind === value?.kind &&
      current?.repoPath === value?.repoPath &&
      current?.groupId === value?.groupId &&
      current?.worktreePath === value?.worktreePath &&
      current?.position === value?.position
    ) {
      return;
    }

    dropTargetRef.current = value;
    setDropTarget(value);
  };

  const setCurrentGroupingTarget = (value: typeof groupingTarget) => {
    groupingTargetRef.current = value;
    setGroupingTarget(value);
  };

  const clearGroupHoverTimer = () => {
    if (groupHoverTimerRef.current !== null) {
      window.clearTimeout(groupHoverTimerRef.current);
      groupHoverTimerRef.current = null;
    }
    groupHoverCandidateRef.current = null;
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    widthRef.current = width;
    pendingWidthRef.current = width;
    beginPanelResize();
    setIsResizing(true);
  }, [width]);

  const applyResizeWidth = useCallback((newWidth: number) => {
    widthRef.current = newWidth;
    if (containerRef.current) {
      containerRef.current.style.width = `${newWidth}px`;
    }
    if (innerRef.current) {
      innerRef.current.style.width = `${newWidth}px`;
    }
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    let ended = false;

    const handleMouseMove = (e: MouseEvent) => {
      pendingWidthRef.current = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, e.clientX),
      );
      if (resizeFrameRef.current !== null) return;
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        applyResizeWidth(pendingWidthRef.current);
      });
    };

    const handleMouseUp = () => {
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      applyResizeWidth(pendingWidthRef.current);
      ended = true;
      endPanelResize();
      setIsResizing(false);
      setWidth(widthRef.current);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      if (!ended) endPanelResize();
    };
  }, [applyResizeWidth, isResizing]);

  const repoGroups = useMemo(() => {
    return repositories.map((repo) => ({
      repoName: repo.info.name || basename(repo.info.path),
      repoPath: repo.info.path,
      avatarUrl: repo.info.avatarUrl,
      worktrees: repo.worktrees.filter((wt) => wt.name !== "main"),
    }));
  }, [repositories]);
  const selectedWorktreeSpace = useMemo(
    () => findSpaceForWorktree(repositories, selectedWorktree),
    [repositories, selectedWorktree],
  );
  const resolvedSpacePath = resolveActiveSpace(
    repositories,
    null,
    activeSpacePath,
  );
  const activeRepoGroups = repoGroups.filter(
    (group) => group.repoPath === resolvedSpacePath,
  );

  useEffect(() => {
    if (!selectedWorktreeSpace) {
      return;
    }

    setActiveSpacePath((current) => {
      if (current === selectedWorktreeSpace) return current;
      saveActiveSpace(selectedWorktreeSpace);
      return selectedWorktreeSpace;
    });
  }, [selectedWorktree?.path, selectedWorktreeSpace]);

  useEffect(() => {
    if (!resolvedSpacePath || resolvedSpacePath === activeSpacePath) {
      return;
    }

    setActiveSpacePath(resolvedSpacePath);
    saveActiveSpace(resolvedSpacePath);
  }, [activeSpacePath, resolvedSpacePath]);

  const handleSpaceSelect = (repoPath: string) => {
    setActiveSpacePath(repoPath);
    saveActiveSpace(repoPath);
  };

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

  const handleRemoveRepository = (repoPath: string) => {
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
    clearGroupHoverTimer();
    dragSessionRef.current = null;
    setCurrentDraggedWorktree(null);
    setCurrentDropTarget(null);
    setCurrentGroupingTarget(null);
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

      const element = document.elementFromPoint(e.clientX, e.clientY);
      const worktreeTarget = element?.closest<HTMLElement>(
        "[data-worktree-drop-target='true']"
      );
      const groupTarget = element?.closest<HTMLElement>(
        "[data-sidebar-group-drop-target='true']"
      );

      if (!worktreeTarget && groupTarget) {
        const repoPath = groupTarget.dataset.repoPath;
        const groupId = groupTarget.dataset.groupId;
        if (repoPath && groupId && repoPath === currentDrag.repoPath) {
          clearGroupHoverTimer();
          setCurrentGroupingTarget(null);
          setCurrentDropTarget({
            repoPath,
            kind: "group",
            groupId,
            position: "inside",
          });
          return;
        }
      }

      if (!worktreeTarget) {
        clearGroupHoverTimer();
        setCurrentGroupingTarget(null);
        setCurrentDropTarget(null);
        return;
      }

      const repoPath = worktreeTarget.dataset.repoPath;
      const worktreePath = worktreeTarget.dataset.worktreePath;
      if (
        !repoPath ||
        !worktreePath ||
        repoPath !== currentDrag.repoPath ||
        worktreePath === currentDrag.worktreePath
      ) {
        clearGroupHoverTimer();
        setCurrentGroupingTarget(null);
        setCurrentDropTarget(null);
        return;
      }

      const candidate = { repoPath, worktreePath };
      const activeGrouping = groupingTargetRef.current;
      const currentCandidate = groupHoverCandidateRef.current;
      const isSameCandidate =
        currentCandidate?.repoPath === candidate.repoPath &&
        currentCandidate.worktreePath === candidate.worktreePath;

      if (!isSameCandidate && !activeGrouping) {
        clearGroupHoverTimer();
        groupHoverCandidateRef.current = candidate;
        groupHoverTimerRef.current = window.setTimeout(() => {
          setCurrentGroupingTarget(candidate);
          setCurrentDropTarget(null);
          groupHoverTimerRef.current = null;
          groupHoverCandidateRef.current = candidate;
        }, GROUP_HOLD_DELAY_MS);
      }

      if (
        activeGrouping?.repoPath === repoPath &&
        activeGrouping.worktreePath === worktreePath
      ) {
        setCurrentDropTarget(null);
        return;
      }

      setCurrentGroupingTarget(null);

      const bounds = worktreeTarget.getBoundingClientRect();
      const position = e.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
      setCurrentDropTarget({
        repoPath,
        kind: "worktree",
        worktreePath,
        position,
      });
    };

    const handlePointerUp = async () => {
      const currentDrag = draggedWorktreeRef.current;
      const currentDrop = dropTargetRef.current;
      const currentGrouping = groupingTargetRef.current;

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
        (currentGrouping &&
          (currentDrag.repoPath !== currentGrouping.repoPath ||
            currentDrag.worktreePath === currentGrouping.worktreePath))
      ) {
        endWorktreeDrag();
        return;
      }

      if (currentGrouping) {
        const createdGroupId = await createSidebarGroup(
          currentGrouping.repoPath,
          currentDrag.worktreePath,
          currentGrouping.worktreePath
        );
        if (createdGroupId) {
          const createdGroup = useAppStore
            .getState()
            .sidebarGroupsByRepo[currentGrouping.repoPath]
            ?.find((group) => group.id === createdGroupId);

          if (createdGroup) {
            setEditingGroup({
              repoPath: currentGrouping.repoPath,
              groupId: createdGroupId,
              value: createdGroup.name,
            });
          }
        }
        endWorktreeDrag();
        return;
      }

      if (
        !currentDrop ||
        currentDrag.repoPath !== currentDrop.repoPath ||
        (currentDrop.kind === "worktree" &&
          currentDrag.worktreePath === currentDrop.worktreePath)
      ) {
        endWorktreeDrag();
        return;
      }

      if (currentDrop.kind === "group" && currentDrop.groupId) {
        await moveWorktreeInSidebar(currentDrop.repoPath, {
          sourceWorktreePath: currentDrag.worktreePath,
          targetGroupId: currentDrop.groupId,
          position: "inside",
        });
      } else if (
        currentDrop.kind === "worktree" &&
        currentDrop.worktreePath &&
        currentDrop.position
      ) {
        await moveWorktreeInSidebar(currentDrop.repoPath, {
          sourceWorktreePath: currentDrag.worktreePath,
          targetWorktreePath: currentDrop.worktreePath,
          position: currentDrop.position,
        });
      }

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
  }, [createSidebarGroup, isReorderPointerActive, moveWorktreeInSidebar, selectWorktree]);

  const commitGroupRename = async (
    repoPath: string,
    groupId: string,
    value: string
  ) => {
    await renameSidebarGroup(repoPath, groupId, value);
    setEditingGroup((current) =>
      current?.repoPath === repoPath && current.groupId === groupId
        ? null
        : current
    );
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
        transition: "none",
      }}
    >
      <div
        ref={innerRef}
        className="flex h-full flex-col border-r border-border bg-secondary pt-8 select-none"
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

      <div className="flex min-h-0 flex-1 flex-col px-1.5 pb-1.5">
        <section className="shrink-0 pb-1.5" aria-labelledby="spaces-heading">
          <div className="flex h-8 items-center px-1.5">
            <h2
              id="spaces-heading"
              className="text-xs font-semibold tracking-wide text-tertiary"
            >
              Spaces
            </h2>
          </div>
          <div
            className="max-h-40 space-y-0.5 overflow-y-auto scrollbar-hide"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {repoGroups.map((space) => {
              const avatarUrl = space.avatarUrl;
              const showAvatar =
                avatarUrl !== undefined && !failedAvatarUrls.has(avatarUrl);
              const isActive = space.repoPath === resolvedSpacePath;

              return (
                <div
                  key={space.repoPath}
                  className={cn(
                    "group/space flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left transition-colors motion-reduce:transition-none",
                    isActive
                      ? "bg-active text-primary"
                      : "text-secondary hover:bg-hover hover:text-primary",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleSpaceSelect(space.repoPath)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    aria-pressed={isActive}
                    aria-label={`Show ${space.repoName} sessions`}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        isActive ? "bg-accent-primary" : "bg-border-strong",
                      )}
                    />
                    {showAvatar ? (
                      <img
                        src={avatarUrl}
                        alt=""
                        className="h-4 w-4 shrink-0 rounded"
                        onError={() => {
                          setFailedAvatarUrls((current) => {
                            if (!avatarUrl) return current;
                            const next = new Set(current);
                            next.add(avatarUrl);
                            return next;
                          });
                        }}
                      />
                    ) : (
                      <Folder className="h-4 w-4 shrink-0 text-tertiary" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {space.repoName}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover/space:opacity-100 focus-within:opacity-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-md p-1 text-tertiary hover:bg-hover hover:text-primary"
                          title="Space actions"
                          aria-label={`${space.repoName} space actions`}
                        >
                          <Ellipsis className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={handleAddRepository}>
                          <Plus />
                          Add Space
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => handleRemoveRepository(space.repoPath)}
                          className="text-red-500 focus:text-red-500"
                        >
                          <Archive />
                          Archive repository
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleCreateWorktree(space.repoPath);
                      }}
                      className="rounded-md p-1 text-tertiary hover:bg-hover hover:text-primary"
                      title="New session"
                      aria-label={`Create a new ${space.repoName} session`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleCaptainTerminal(space.repoPath);
                      }}
                      className={cn(
                        "rounded-md p-1 hover:bg-hover",
                        captainTerminalRepoPath === space.repoPath
                          ? "text-accent-primary"
                          : "text-tertiary hover:text-primary",
                      )}
                      title={`Open ${space.repoName} captain terminal`}
                      aria-label={`Open ${space.repoName} captain terminal`}
                      aria-pressed={captainTerminalRepoPath === space.repoPath}
                    >
                      <SquareTerminal className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
            {repositories.length === 0 && (
              <button
                type="button"
                onClick={handleAddRepository}
                className="w-full rounded-md px-2.5 py-2 text-left text-xs text-tertiary hover:bg-hover hover:text-primary"
              >
                Add a repository to create your first Space.
              </button>
            )}
          </div>
        </section>

        <div className="-mx-1.5 h-px shrink-0 bg-border-subtle" />

        <div className="flex h-8 shrink-0 items-center px-1.5">
          <h2 className="text-xs font-semibold tracking-wide text-tertiary">
            Sessions
          </h2>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto scrollbar-hide"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <div className="flex flex-col gap-0.5">
          {activeRepoGroups.map((group) => {
            return (
              <div key={group.repoPath} className="w-full min-w-0">
                   <div className="w-full min-w-0 space-y-0.5">
                     {(() => {
                       const repoPrs = prStatusByBranch[group.repoPath] ?? {};
                       const repoSidebarGroups = sidebarGroupsByRepo[group.repoPath] ?? [];
                       const groupByWorktreePath = new Map<string, SidebarWorktreeGroupModel>();
                       for (const sidebarGroup of repoSidebarGroups) {
                         for (const worktreePath of sidebarGroup.worktreePaths) {
                           groupByWorktreePath.set(worktreePath, sidebarGroup);
                         }
                       }

                       const ungroupedPrs = Object.fromEntries(
                         group.worktrees
                           .filter((wt) => !groupByWorktreePath.has(wt.path) && wt.branch)
                           .flatMap((wt) => {
                             const pr = wt.branch ? repoPrs[wt.branch] : undefined;
                             return pr ? [[wt.branch, pr] as const] : [];
                           })
                       );
                       const { stacks } = detectStacks(ungroupedPrs);
                       const stackWorktreePaths = new Map<string, number>();

                       for (const [stackIndex, stack] of stacks.entries()) {
                         for (const pr of stack.allPrs) {
                           const matchingWorktree = group.worktrees.find(
                             (wt) => wt.branch === pr.head_branch
                           );
                           if (matchingWorktree) {
                             stackWorktreePaths.set(matchingWorktree.path, stackIndex);
                           }
                         }
                       }

                       const renderItem = (wt: WorktreeInfo) => {
                         const prStatus = prStatusByWorktreePath[wt.path] ?? null;
                         const processStatus = processStatusByPath[wt.path] || 'none';
                         const agentRunState = agentSidebarLifecycleEnabled ? agentRunByWorktreePath[wt.path] : undefined;
                         const isDragSource = draggedWorktree?.worktreePath === wt.path;
                         const showDropBefore =
                           dropTarget?.repoPath === group.repoPath &&
                           dropTarget.kind === "worktree" &&
                           dropTarget.worktreePath === wt.path &&
                           dropTarget.position === "before";
                         const showDropAfter =
                           dropTarget?.repoPath === group.repoPath &&
                           dropTarget.kind === "worktree" &&
                           dropTarget.worktreePath === wt.path &&
                           dropTarget.position === "after";
                         const showGroupingTarget =
                           groupingTarget?.repoPath === group.repoPath &&
                           groupingTarget.worktreePath === wt.path;

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
                             {showGroupingTarget && (
                               <div className="absolute inset-0 rounded-md border border-dashed border-accent-primary pointer-events-none" />
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
                               isActive={!captainTerminalRepoPath && selectedWorktree?.path === wt.path}
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
                       const renderedWorktreePaths = new Set<string>();

                       for (const wt of group.worktrees) {
                         if (renderedWorktreePaths.has(wt.path)) {
                           continue;
                         }

                         const sidebarGroup = groupByWorktreePath.get(wt.path);
                         if (sidebarGroup) {
                           const isEditingGroup =
                             editingGroup?.repoPath === group.repoPath &&
                             editingGroup.groupId === sidebarGroup.id;
                           const isGroupDropTarget =
                             dropTarget?.repoPath === group.repoPath &&
                             dropTarget.kind === "group" &&
                             dropTarget.groupId === sidebarGroup.id;
                           const groupedWorktrees = sidebarGroup.worktreePaths
                             .map((worktreePath) =>
                               group.worktrees.find((worktree) => worktree.path === worktreePath)
                             )
                             .filter((worktree): worktree is WorktreeInfo => worktree !== undefined);

                           for (const groupedWorktree of groupedWorktrees) {
                             renderedWorktreePaths.add(groupedWorktree.path);
                           }

                           elements.push(
                             <div
                               key={sidebarGroup.id}
                               data-sidebar-group-drop-target="true"
                               data-repo-path={group.repoPath}
                               data-group-id={sidebarGroup.id}
                             >
                               <SidebarWorktreeGroup
                                 label={sidebarGroup.name}
                                 count={groupedWorktrees.length}
                                 isDropTarget={isGroupDropTarget}
                                 isEditing={isEditingGroup}
                                 editingValue={
                                   isEditingGroup ? editingGroup.value : sidebarGroup.name
                                 }
                                 onEditingValueChange={(value) =>
                                   setEditingGroup({
                                     repoPath: group.repoPath,
                                     groupId: sidebarGroup.id,
                                     value,
                                   })
                                 }
                                 onEditingSubmit={() =>
                                   commitGroupRename(
                                     group.repoPath,
                                     sidebarGroup.id,
                                     (isEditingGroup ? editingGroup.value : sidebarGroup.name)
                                   )
                                 }
                                 onEditingCancel={() => setEditingGroup(null)}
                                 onStartEditing={() =>
                                   setEditingGroup({
                                     repoPath: group.repoPath,
                                     groupId: sidebarGroup.id,
                                     value: sidebarGroup.name,
                                   })
                                 }
                               >
                                 {groupedWorktrees.map(renderItem)}
                               </SidebarWorktreeGroup>
                             </div>
                           );
                           continue;
                         }

                        const stackIndex = stackWorktreePaths.get(wt.path);
                        if (stackIndex !== undefined) {
                          const stack = stacks[stackIndex];
                          const groupedWorktrees = stack.allPrs
                            .map((pr) =>
                              group.worktrees.find(
                                (worktree) => worktree.branch === pr.head_branch
                              )
                            )
                            .filter((worktree): worktree is WorktreeInfo => worktree !== undefined);

                          for (const groupedWorktree of groupedWorktrees) {
                            renderedWorktreePaths.add(groupedWorktree.path);
                          }

                           elements.push(
                             <StackGroup
                               key={`stack-${stack.root.pr.number}`}
                               label={getStackLabel(stack)}
                               count={stack.allPrs.length}
                             >
                               {groupedWorktrees.map(renderItem)}
                             </StackGroup>
                           );
                           continue;
                         }

                         renderedWorktreePaths.add(wt.path);
                         elements.push(renderItem(wt));
                       }

                        return elements;
                     })()}
                   </div>
              </div>
            );
          })}

          {repositories.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-secondary">
              No sessions yet
            </div>
          )}
          {repositories.length > 0 && activeRepoGroups.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-secondary">
              Select a Space to see its sessions
            </div>
          )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-3 mb-2 p-2 text-xs rounded border text-semantic-error bg-semantic-error-muted border-semantic-error">
          {error}
        </div>
      )}

      <div className="px-1.5 pb-1.5">
        <div className="flex items-center justify-between">
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
