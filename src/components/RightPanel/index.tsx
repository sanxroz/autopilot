import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  GitMerge,
  ChevronDown,
  ExternalLink,
  ListTodo,
  ClipboardList,
  type LucideIcon,
  Diff,
  GitBranch,
  Loader,
  FileText,
  AppWindow,
} from "lucide-react";
import { usePRStatusForWorktree } from "../../hooks/usePRStatus";
import { useMergePR } from "../../hooks/useMergePR";
import {
  getOpenWithIconSources,
} from "../../lib/open-with";
import { useAppStore } from "../../store";
import { cn } from "../../utils/cn";

import { ChecksTab } from "./ChecksTab";
import { CommentsTab } from "./CommentsTab";
import { DiffTab } from "./DiffTab";
import { GitTab } from "./GitTab";
import { NotesTab } from "./NotesTab";
import { Tabs, TabsList, TabsTrigger } from "../ui/segmented-control";
import * as Tooltip from "../ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { type InstalledIde } from "../../types";
interface RightPanelProps {
  worktreePath: string | null;
}

type TabId = "checks" | "comments" | "notes" | "changes" | "git";

const MIN_WIDTH = 300;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 450;

function OpenWithIcon({ ide }: { readonly ide: InstalledIde }) {
  const sources = useMemo(() => getOpenWithIconSources(ide), [ide]);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [sources]);

  const activeSrc = sources[sourceIndex];

  if (!activeSrc) {
    return (
      <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
        <AppWindow className="h-3.5 w-3.5 text-tertiary" />
      </div>
    );
  }

  return (
    <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center overflow-hidden">
      <img
        src={activeSrc}
        alt=""
        className="h-[18px] w-[18px] object-contain"
        loading="eager"
        onError={() => {
          setSourceIndex((currentIndex) => currentIndex + 1);
        }}
      />
    </div>
  );
}

function isReadyToMerge(prStatus: NonNullable<ReturnType<typeof usePRStatusForWorktree>>): boolean {
  return (
    !prStatus.merged &&
    !prStatus.draft &&
    prStatus.state === "open" &&
    prStatus.checks_status === "success" &&
    (prStatus.review_decision === "APPROVED" || prStatus.review_decision === null)
  );
}

export function RightPanel({ worktreePath }: RightPanelProps) {
  const reducedMotion = useReducedMotion();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(DEFAULT_WIDTH);
  const [activeTab, setActiveTab] = useState<TabId>("checks");
  const [openingIdeId, setOpeningIdeId] = useState<string | null>(null);

  const repositories = useAppStore((state) => state.repositories);
  const installedIdes = useAppStore((state) => state.installedIdes);
  const isLoadingIdes = useAppStore((state) => state.isLoadingInstalledIdes);

  const repoPath =
    repositories.find((r) => r.worktrees.some((w) => w.path === worktreePath))
      ?.info.path ?? null;

  const prStatus = usePRStatusForWorktree(worktreePath);

  const { isMerging, hasMerged, handleMerge } = useMergePR({
    repoPath,
    prNumber: prStatus?.number ?? null,
  });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    widthRef.current = width;
    setIsResizing(true);
  }, [width]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const containerRight = window.innerWidth;
      const newWidth = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, containerRight - e.clientX),
      );
      widthRef.current = newWidth;
      if (containerRef.current) {
        containerRef.current.style.width = `${newWidth}px`;
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

  const getChecksColor = () => {
    return "text-secondary";
  };

  const handleOpenWith = useCallback(
    async (ideId: string) => {
      if (!worktreePath) {
        return;
      }

      setOpeningIdeId(ideId);
      try {
        await invoke("open_worktree_in_ide", { worktreePath, ideId });
      } catch (error) {
        console.error(`Failed to open worktree in ${ideId}:`, error);
      } finally {
        setOpeningIdeId(null);
      }
    },
    [worktreePath],
  );

  useEffect(() => {
    setOpeningIdeId(null);
  }, [worktreePath]);

  const canMergePR = prStatus ? isReadyToMerge(prStatus) : false;

  const diffViewMode = useAppStore((state) => state.diffViewMode);
  const prevDiffViewModeRef = useRef(diffViewMode);

  const showChangesTab = diffViewMode === "sidebar";
  const displayedTab = !prStatus && activeTab === "checks" ? "comments" : activeTab;

  useEffect(() => {
    const prevMode = prevDiffViewModeRef.current;
    prevDiffViewModeRef.current = diffViewMode;

    if (diffViewMode === 'sidebar' && prevMode === 'overlay') {
      setActiveTab("changes");
    } else if (diffViewMode === 'overlay' && prevMode === 'sidebar' && activeTab === "changes") {
      setActiveTab("checks");
    }
  }, [diffViewMode, activeTab]);

  const tabs: { id: TabId; label: string; icon: LucideIcon; color?: string }[] =
    [
      ...(prStatus
        ? [{ id: "checks" as TabId, label: "Checks", icon: ListTodo, color: getChecksColor() }]
        : []),
      { id: "comments", label: "Comments", icon: ClipboardList },
      { id: "notes", label: "Notes", icon: FileText },
      ...(showChangesTab
        ? [{ id: "changes" as TabId, label: "Changes", icon: Diff }]
        : []),
      { id: "git", label: "Git", icon: GitBranch },
    ];

  return (
    <motion.div
      ref={containerRef}
      initial={reducedMotion ? false : { x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { x: 400, opacity: 0 }}
      transition={{
        duration: reducedMotion ? 0 : 0.25,
        ease: [0.215, 0.61, 0.355, 1],
      }}
      className="relative flex flex-col h-full select-none border-l border-border"
      style={{
        width: `${width}px`,
        minWidth: `${MIN_WIDTH}px`,
        maxWidth: `${MAX_WIDTH}px`,
      }}
    >
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          "absolute top-0 left-0 w-1 h-full cursor-col-resize z-10 transition-colors",
          isResizing ? "bg-border-strong" : "bg-transparent"
        )}
      />

      <div className="flex items-center gap-1 px-3 h-[35px] min-h-[35px]">
        {prStatus && (
          <a
            href={prStatus.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors mr-2 text-secondary hover:bg-hover hover:text-primary"
            title={prStatus.title}
          >
            <span className="font-medium">#{prStatus.number}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}

        <Tooltip.Provider delayDuration={300}>
          <Tabs
            value={displayedTab}
            onValueChange={(value: string) => setActiveTab(value as TabId)}
          >
            <TabsList
              containerBgColor="var(--color-bg-primary)"
              floatingBgColor="var(--color-bg-tertiary)"
            >
              {tabs.map((tab) => {
                const isActive = displayedTab === tab.id;
                return (
                  <Tooltip.Root key={tab.id}>
                    <Tooltip.Trigger asChild>
                      <TabsTrigger
                        value={tab.id}
                        className={cn(
                          tab.color
                            ? tab.color
                            : isActive
                              ? "text-primary"
                              : "text-secondary"
                        )}
                      >
                        <tab.icon className="w-3.5 h-3.5" />
                      </TabsTrigger>
                    </Tooltip.Trigger>
                    <Tooltip.Content side="bottom" size="small">
                      {tab.label}
                    </Tooltip.Content>
                  </Tooltip.Root>
                );
              })}
            </TabsList>
          </Tabs>
        </Tooltip.Provider>

        <div className="flex-1" />

        {worktreePath && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors hover:bg-opacity-80 text-primary">
                Open With
                {isLoadingIdes && installedIdes.length === 0 && (
                  <Loader className="w-3 h-3 animate-spin opacity-70" />
                )}
                <ChevronDown className="w-3.5 h-3.5 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isLoadingIdes ? (
                <DropdownMenuItem disabled>
                  <Loader className="w-3 h-3 animate-spin" />
                  <span>Detecting editors...</span>
                </DropdownMenuItem>
              ) : installedIdes.length > 0 ? (
                installedIdes.map((ide) => {
                  return (
                    <DropdownMenuItem
                      key={ide.id}
                      className="gap-2 px-2 py-1.5 text-[11px]"
                      disabled={openingIdeId !== null}
                      onClick={() => {
                        void handleOpenWith(ide.id);
                      }}
                    >
                      {openingIdeId === ide.id ? (
                        <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                          <Loader className="h-3.5 w-3.5 animate-spin" />
                        </div>
                      ) : (
                        <OpenWithIcon ide={ide} />
                      )}
                      <span className="font-medium leading-none">{ide.name}</span>
                    </DropdownMenuItem>
                  );
                })
              ) : (
                <DropdownMenuItem disabled>
                  <span>No supported editors found</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {canMergePR && !hasMerged && (
          <button
            onClick={handleMerge}
            disabled={isMerging}
            className="px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-70"
            style={{
              background: "#22C55E",
              color: "white",
            }}
          >
            {isMerging ? (
              <Loader className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <GitMerge className="w-3.5 h-3.5" />
            )}
            {isMerging ? "Merging..." : "Merge"}
          </button>
        )}

      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          {prStatus && displayedTab === "checks" && (
            <motion.div
              key="checks"
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
              transition={{
                duration: reducedMotion ? 0 : 0.15,
                ease: [0.215, 0.61, 0.355, 1],
              }}
              className="h-full overflow-hidden flex flex-col"
            >
              <ChecksTab
                repoPath={repoPath}
                prNumber={prStatus?.number ?? null}
                prStatus={prStatus}
              />
            </motion.div>
          )}
          {displayedTab === "comments" && (
            <motion.div
              key="comments"
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
              transition={{
                duration: reducedMotion ? 0 : 0.15,
                ease: [0.215, 0.61, 0.355, 1],
              }}
              className="h-full overflow-hidden flex flex-col"
            >
              <CommentsTab
                repoPath={repoPath}
                prNumber={prStatus?.number ?? null}
                prStatus={prStatus}
              />
            </motion.div>
          )}

          {displayedTab === "changes" && (
            <motion.div
              key="changes"
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
              transition={{
                duration: reducedMotion ? 0 : 0.15,
                ease: [0.215, 0.61, 0.355, 1],
              }}
              className="h-full overflow-hidden flex flex-col"
            >
              <DiffTab worktreePath={worktreePath} />
            </motion.div>
          )}

          {displayedTab === "notes" && (
            <motion.div
              key="notes"
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
              transition={{
                duration: reducedMotion ? 0 : 0.15,
                ease: [0.215, 0.61, 0.355, 1],
              }}
              className="h-full overflow-hidden flex flex-col"
            >
              <NotesTab worktreePath={worktreePath} />
            </motion.div>
          )}

          {displayedTab === "git" && (
            <motion.div
              key="git"
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
              transition={{
                duration: reducedMotion ? 0 : 0.15,
                ease: [0.215, 0.61, 0.355, 1],
              }}
              className="h-full overflow-hidden flex flex-col"
            >
              <GitTab worktreePath={worktreePath} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
