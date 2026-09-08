import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Plus,
  Sun,
  Moon,
  Archive,
  Ellipsis,
  User,
  SquareTerminal,
  Bot,
  GitPullRequest,
  CircleHelp,
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
import { KeyboardShortcutsHelp } from "./KeyboardShortcutsHelp";
import * as Modal from "./ui/modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  findSpaceForWorktree,
  getSpaceActivity,
  loadActiveSpace,
  resolveActiveSpace,
  saveActiveSpace,
} from "../lib/spaces";
import {
  getAgentSessionSection,
  getHighestPrioritySessionSection,
  getPrSessionSection,
  type SessionMode,
  type SessionSection,
} from "../lib/session-sections";

const SPACE_RAIL_WIDTH = 52;
const MIN_WIDTH = 240 + SPACE_RAIL_WIDTH;
const MAX_WIDTH = 520 + SPACE_RAIL_WIDTH;
const DEFAULT_WIDTH = 312 + SPACE_RAIL_WIDTH;
const DRAG_START_THRESHOLD_PX = 10;
const GROUP_HOLD_DELAY_MS = 1200;
const IS_DEVELOPMENT_BUILD =
  import.meta.env.VITE_AUTOPILOT_DEVELOPMENT === "1";

const PR_SESSION_SECTIONS = [
  { id: "pr:none", label: "No pull request", dot: "bg-border-strong" },
  { id: "pr:attention", label: "Needs attention", dot: "bg-semantic-error" },
  { id: "pr:ready", label: "Ready to merge", dot: "bg-semantic-success" },
  { id: "pr:checks", label: "Checks running", dot: "bg-semantic-warning" },
  { id: "pr:review", label: "In review", dot: "bg-semantic-info" },
  { id: "pr:closed", label: "Closed", dot: "bg-tertiary" },
] as const;

const AGENT_SESSION_SECTIONS = [
  { id: "agent:attention", label: "Needs attention", dot: "bg-semantic-warning" },
  { id: "agent:running", label: "Agent running", dot: "bg-semantic-success" },
  ...PR_SESSION_SECTIONS,
] as const;

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
    clearAgentRunState,
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
  const [sessionMode, setSessionMode] = useState<SessionMode>("pr");
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [pendingWorkspaceDeletion, setPendingWorkspaceDeletion] = useState<{
    repoPath: string;
    worktreeName: string;
  } | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [activeSpacePath, setActiveSpacePath] = useState<string | null>(
    loadActiveSpace,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const sessionsListRef = useRef<HTMLDivElement>(null);
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
  const activeRepoGroup = activeRepoGroups[0] ?? null;
  const selectedWorktreePath = selectedWorktree?.path;

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

  useEffect(() => {
    if (!isOpen || !selectedWorktreePath || captainTerminalRepoPath) return;

    const frame = requestAnimationFrame(() => {
      const selectedItem = Array.from(
        sessionsListRef.current?.querySelectorAll<HTMLElement>(
          "[data-worktree-path]",
        ) ?? [],
      ).find((item) => item.dataset.worktreePath === selectedWorktreePath);

      selectedItem?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });

    return () => cancelAnimationFrame(frame);
  }, [
    captainTerminalRepoPath,
    isOpen,
    resolvedSpacePath,
    selectedWorktreePath,
  ]);

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

    const agentRunState = agentRunByWorktreePath[worktree.path];
    if (
      sessionMode === "agent" &&
      (agentRunState?.status === "completed" ||
        agentRunState?.status === "error")
    ) {
      clearAgentRunState(worktree.path);
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

  const handleDeleteWorktree = (
    repoPath: string,
    worktreeName: string
  ) => {
    setPendingWorkspaceDeletion({ repoPath, worktreeName });
  };

  const closeDeleteWorkspaceDialog = () => {
    setPendingWorkspaceDeletion(null);
  };

  const confirmDeleteWorktree = async () => {
    if (!pendingWorkspaceDeletion) return;

    const { repoPath, worktreeName } = pendingWorkspaceDeletion;
    setError(null);
    setPendingWorkspaceDeletion(null);
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
        className="flex h-full border-r border-border bg-sidebar pt-8 select-none"
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

      <nav
        className="flex w-[52px] shrink-0 flex-col rounded-tr-xl bg-primary pb-1.5"
        aria-label="Spaces"
      >
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto scrollbar-hide">
          {repoGroups.map((space) => {
            const avatarUrl = space.avatarUrl;
            const showAvatar =
              avatarUrl !== undefined && !failedAvatarUrls.has(avatarUrl);
            const isActive = space.repoPath === resolvedSpacePath;
            const sections = space.worktrees.map((worktree) =>
              getAgentSessionSection(
                processStatusByPath[worktree.path] || "none",
                agentSidebarLifecycleEnabled
                  ? agentRunByWorktreePath[worktree.path]
                  : undefined,
                prStatusByWorktreePath[worktree.path] ?? null,
              ),
            );
            const activity = getSpaceActivity(sections);

            return (
              <div key={space.repoPath} className="relative flex justify-center">
                <button
                  type="button"
                  data-space-path={space.repoPath}
                  onClick={() => handleSpaceSelect(space.repoPath)}
                  onFocus={(event) =>
                    event.currentTarget.scrollIntoView({ block: "nearest" })
                  }
                  className={cn(
                    "relative flex h-11 w-11 items-center justify-center rounded-xl text-tertiary transition-[background-color,color] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 motion-reduce:transition-none",
                    isActive
                      ? "bg-active text-primary"
                      : "hover:bg-hover hover:text-primary",
                  )}
                  aria-pressed={isActive}
                  aria-label={`Show ${space.repoName} sessions${activity === "attention" ? ", needs attention" : activity === "running" ? ", activity running" : ""}`}
                  title={space.repoName}
                >
                  {showAvatar ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      className="h-7 w-7 rounded-lg"
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
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-tertiary text-[10px] font-semibold tracking-tight text-secondary">
                      {space.repoName.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  {activity && !isActive && (
                    <span
                      className={cn(
                        "absolute right-1 top-1 h-1.5 w-1.5 rounded-full ring-2 ring-[var(--color-bg-primary)]",
                        activity === "attention"
                          ? "bg-semantic-warning"
                          : "bg-semantic-success",
                      )}
                      aria-hidden="true"
                    />
                  )}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex shrink-0 justify-center pt-1.5">
          <button
            type="button"
            onClick={handleAddRepository}
            className="group flex h-11 w-11 items-center justify-center text-tertiary focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1"
            title="Add Space"
            aria-label="Add Space"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg transition-[background-color,color] group-hover:bg-hover group-hover:text-primary group-active:scale-[0.97] motion-reduce:transition-none">
              <Plus className="h-3.5 w-3.5" />
            </span>
          </button>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-1 px-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
            {activeRepoGroup ? (
              <h2 className="min-w-0 truncate text-sm font-semibold text-primary">
                {activeRepoGroup.repoName}
              </h2>
            ) : (
              <h2 className="text-sm font-semibold text-tertiary">Spaces</h2>
            )}
            {IS_DEVELOPMENT_BUILD && (
              <span className="rounded bg-semantic-warning-muted px-1.5 py-0.5 text-[10px] font-medium text-semantic-warning">
                Development
              </span>
            )}
          </div>

          {activeRepoGroup && (
            <div className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => handleCreateWorktree(activeRepoGroup.repoPath)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-tertiary hover:bg-hover hover:text-primary active:scale-[0.97] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1"
                title="New session"
                aria-label={`Create a new ${activeRepoGroup.repoName} session`}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  onToggleCaptainTerminal(activeRepoGroup.repoPath)
                }
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md hover:bg-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1",
                  captainTerminalRepoPath === activeRepoGroup.repoPath
                    ? "text-accent-primary"
                    : "text-tertiary hover:text-primary",
                )}
                title={`Open ${activeRepoGroup.repoName} captain terminal`}
                aria-label={`Open ${activeRepoGroup.repoName} captain terminal`}
                aria-pressed={
                  captainTerminalRepoPath === activeRepoGroup.repoPath
                }
              >
                <SquareTerminal className="h-3.5 w-3.5" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-md text-tertiary hover:bg-hover hover:text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1"
                    title="Space actions"
                    aria-label={`${activeRepoGroup.repoName} space actions`}
                  >
                    <Ellipsis className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() =>
                      setSessionMode(sessionMode === "pr" ? "agent" : "pr")
                    }
                  >
                    {sessionMode === "pr" ? (
                      <Bot />
                    ) : (
                      <GitPullRequest />
                    )}
                    {sessionMode === "pr"
                      ? "Show Agent sessions"
                      : "Show PR sessions"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() =>
                      handleRemoveRepository(activeRepoGroup.repoPath)
                    }
                    className="text-red-500 focus:text-red-500"
                  >
                    <Archive />
                    Archive repository
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-1.5 pb-1.5">
          {repositories.length === 0 && (
            <button
              type="button"
              onClick={handleAddRepository}
              className="m-1.5 rounded-md px-2.5 py-2 text-left text-xs text-tertiary hover:bg-hover hover:text-primary"
            >
              Add a repository to create your first Space.
            </button>
          )}

        <div className="flex h-8 shrink-0 items-center px-1.5">
          <h2 className="text-xs font-semibold tracking-wide text-tertiary">
            Sessions
          </h2>
        </div>

        <div
          ref={sessionsListRef}
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
                               onDelete={() => handleDeleteWorktree(group.repoPath, wt.name)}
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

                       const renderWorktrees = (
                         worktrees: WorktreeInfo[],
                         sectionId: SessionSection,
                       ) => {
                         const includedPaths = new Set(worktrees.map((worktree) => worktree.path));
                         const elements: React.ReactNode[] = [];
                         const renderedWorktreePaths = new Set<string>();

                         for (const wt of worktrees) {
                           if (renderedWorktreePaths.has(wt.path)) continue;

                           const sidebarGroup = groupByWorktreePath.get(wt.path);
                           if (sidebarGroup) {
                             const groupedWorktrees = sidebarGroup.worktreePaths
                               .map((worktreePath) =>
                                 group.worktrees.find((worktree) => worktree.path === worktreePath)
                               )
                               .filter(
                                 (worktree): worktree is WorktreeInfo =>
                                   worktree !== undefined && includedPaths.has(worktree.path),
                               );

                             if (groupedWorktrees.length > 0) {
                               for (const groupedWorktree of groupedWorktrees) {
                                 renderedWorktreePaths.add(groupedWorktree.path);
                               }

                               elements.push(renderGroup(sidebarGroup));
                               continue;
                             }
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
                               .filter(
                                 (worktree): worktree is WorktreeInfo =>
                                   worktree !== undefined && includedPaths.has(worktree.path),
                               );

                             if (groupedWorktrees.length > 1) {
                               for (const groupedWorktree of groupedWorktrees) {
                                 renderedWorktreePaths.add(groupedWorktree.path);
                               }

                               elements.push(
                                 <StackGroup
                                   key={`${sectionId}-stack-${stack.root.pr.number}`}
                                   label={getStackLabel(stack)}
                                   count={groupedWorktrees.length}
                                 >
                                   {groupedWorktrees.map(renderItem)}
                                 </StackGroup>,
                               );
                               continue;
                             }
                           }

                           renderedWorktreePaths.add(wt.path);
                           elements.push(renderItem(wt));
                         }

                         return elements;
                       };

                       function renderGroup(sidebarGroup: SidebarWorktreeGroupModel) {
                         const groupedWorktrees = sidebarGroup.worktreePaths
                           .map((worktreePath) =>
                             group.worktrees.find((worktree) => worktree.path === worktreePath)
                           )
                           .filter((worktree): worktree is WorktreeInfo => worktree !== undefined);
                         if (groupedWorktrees.length === 0) return null;

                         const isEditingGroup =
                           editingGroup?.repoPath === group.repoPath &&
                           editingGroup.groupId === sidebarGroup.id;
                         const isGroupDropTarget =
                           dropTarget?.repoPath === group.repoPath &&
                           dropTarget.kind === "group" &&
                           dropTarget.groupId === sidebarGroup.id;

                         return (
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
                               editingValue={isEditingGroup ? editingGroup.value : sidebarGroup.name}
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
                                   isEditingGroup ? editingGroup.value : sidebarGroup.name,
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
                       }

                       const sections: readonly {
                         id: SessionSection;
                         label: string;
                         dot: string;
                       }[] = sessionMode === "pr"
                         ? PR_SESSION_SECTIONS
                         : AGENT_SESSION_SECTIONS;

                       const getWorktreeSection = (worktree: WorktreeInfo): SessionSection =>
                         sessionMode === "pr"
                           ? getPrSessionSection(prStatusByWorktreePath[worktree.path] ?? null)
                           : getAgentSessionSection(
                               processStatusByPath[worktree.path] || "none",
                               agentSidebarLifecycleEnabled
                                 ? agentRunByWorktreePath[worktree.path]
                                 : undefined,
                               prStatusByWorktreePath[worktree.path] ?? null,
                             );
                       const sectionPriority = sections.map((section) => section.id);
                       const groupSectionById = new Map(
                         repoSidebarGroups.map((sidebarGroup) => [
                           sidebarGroup.id,
                           getHighestPrioritySessionSection(
                             sidebarGroup.worktreePaths.flatMap((worktreePath) => {
                               const worktree = group.worktrees.find(
                                 (candidate) => candidate.path === worktreePath,
                               );
                               return worktree ? [getWorktreeSection(worktree)] : [];
                             }),
                             sectionPriority,
                           ),
                         ]),
                       );

                       return (
                         <div className="space-y-2.5 pb-1">
                           {sections.map((section) => {
                             const worktrees = group.worktrees.filter((worktree) => {
                               const sidebarGroup = groupByWorktreePath.get(worktree.path);
                               return sidebarGroup
                                 ? groupSectionById.get(sidebarGroup.id) === section.id
                                 : getWorktreeSection(worktree) === section.id;
                             });

                             if (worktrees.length === 0) return null;

                             return (
                               <section
                                 key={section.id}
                                 aria-label={`${section.label}, ${worktrees.length} sessions`}
                               >
                                 <div className="flex h-7 items-center gap-1.5 px-2.5 pt-0.5">
                                   <span
                                     className={cn("h-1.5 w-1.5 rounded-full", section.dot)}
                                     aria-hidden="true"
                                   />
                                   <h3 className="min-w-0 flex-1 truncate text-[11px] font-medium text-tertiary">
                                     {section.label}
                                   </h3>
                                   <span className="font-mono text-[10px] tabular-nums text-tertiary">
                                     {worktrees.length}
                                   </span>
                                 </div>
                                 <div className="space-y-0.5">
                                   {renderWorktrees(worktrees, section.id)}
                                 </div>
                               </section>
                             );
                           })}
                         </div>
                       );
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
        <div className="flex min-h-8 items-center justify-between">
          <div className="flex items-center gap-1">
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
            <button
              type="button"
              onClick={() => setShortcutsHelpOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-hover hover:text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1"
              title="Keyboard shortcuts"
              aria-label="Show keyboard shortcuts"
            >
              <CircleHelp className="h-3.5 w-3.5" />
            </button>
          </div>

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
      <KeyboardShortcutsHelp
        open={shortcutsHelpOpen}
        onOpenChange={setShortcutsHelpOpen}
      />
      <Modal.Root
        open={pendingWorkspaceDeletion !== null}
        onOpenChange={(open) => {
          if (!open) closeDeleteWorkspaceDialog();
        }}
      >
        <Modal.Content className="p-5">
          <Modal.Title>Delete workspace?</Modal.Title>
          <Modal.Description className="mt-2 leading-5">
            Delete{" "}
            <strong className="font-medium text-primary">
              {pendingWorkspaceDeletion?.worktreeName}
            </strong>{" "}
            and its uncommitted changes? The Git branch will remain.
          </Modal.Description>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={closeDeleteWorkspaceDialog}
              className="min-h-8 rounded-md px-4 text-sm text-secondary transition-colors hover:bg-hover hover:text-primary motion-reduce:transition-none"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmDeleteWorktree()}
              className="min-h-8 rounded-md bg-semantic-error px-4 text-sm font-medium text-white transition-colors motion-reduce:transition-none"
            >
              Delete workspace
            </button>
          </div>
        </Modal.Content>
      </Modal.Root>
      </div>
    </div>
    </div>
  );
}
