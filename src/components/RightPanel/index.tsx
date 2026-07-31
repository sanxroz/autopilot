import { memo, useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { usePRStatusForWorktree } from "../../hooks/usePRStatus";
import { useAppStore } from "../../store";
import { cn } from "../../utils/cn";
import { beginPanelResize, endPanelResize } from "../../utils/panelResize";

import { ChecksTab } from "./ChecksTab";
import { CommentsTab } from "./CommentsTab";
import { GitTab } from "./GitTab";
import { NotesTab } from "./NotesTab";
import type { RightPanelTabId } from "../RightPanelToolbar";
interface RightPanelProps {
  worktreePath: string | null;
  activeTab: RightPanelTabId;
}

const MIN_WIDTH = 360;
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 560;
const MemoizedChecksTab = memo(ChecksTab);
const MemoizedCommentsTab = memo(CommentsTab);
const MemoizedGitTab = memo(GitTab);
const MemoizedNotesTab = memo(NotesTab);

function PullRequestView({
  repoPath,
  prStatus,
}: {
  repoPath: string | null;
  prStatus: ReturnType<typeof usePRStatusForWorktree>;
}) {
  if (!prStatus) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-tertiary">
        No pull request found for this branch
      </div>
    );
  }

  return (
    <MemoizedCommentsTab
      repoPath={repoPath}
      prNumber={prStatus.number}
      prStatus={prStatus}
    >
      <section aria-labelledby="pr-checks-heading" className="border-t border-border-subtle">
        <div className="px-5 pb-1 pt-4">
          <h2 id="pr-checks-heading" className="text-sm font-semibold text-primary">
            Checks
          </h2>
          <p className="mt-0.5 text-xs text-tertiary">Builds, tests, and deployments</p>
        </div>
        <MemoizedChecksTab
          embedded
          repoPath={repoPath}
          prNumber={prStatus.number}
          prStatus={prStatus}
        />
      </section>
    </MemoizedCommentsTab>
  );
}

export function RightPanel({
  worktreePath,
  activeTab,
}: RightPanelProps) {
  const reducedMotion = useReducedMotion();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(DEFAULT_WIDTH);
  const pendingWidthRef = useRef(DEFAULT_WIDTH);
  const resizeFrameRef = useRef<number | null>(null);

  const repositories = useAppStore((state) => state.repositories);

  const repoPath =
    repositories.find((r) => r.worktrees.some((w) => w.path === worktreePath))
      ?.info.path ?? null;

  const prStatus = usePRStatusForWorktree(worktreePath);

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
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    let ended = false;

    const handleMouseMove = (e: MouseEvent) => {
      const containerRight = window.innerWidth;
      pendingWidthRef.current = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, containerRight - e.clientX),
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

  const displayedTab = activeTab;
  const [visitedTabs, setVisitedTabs] = useState<Set<RightPanelTabId>>(new Set());

  useEffect(() => {
    setVisitedTabs((current) => {
      if (current.has(displayedTab)) return current;
      const next = new Set(current);
      next.add(displayedTab);
      return next;
    });
  }, [displayedTab]);

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
      className="app-panel relative flex h-full flex-col overflow-hidden rounded-xl border border-border-subtle bg-primary select-none"
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

      <div className="flex-1 overflow-hidden flex flex-col">
        {(displayedTab === "pr" || visitedTabs.has("pr")) && (
          <div
            className={cn(
              "h-full overflow-hidden flex flex-col",
              displayedTab !== "pr" && "hidden",
            )}
          >
            <PullRequestView repoPath={repoPath} prStatus={prStatus} />
          </div>
        )}

        {(displayedTab === "notes" || visitedTabs.has("notes")) && (
          <div
            className={cn(
              "h-full overflow-hidden flex flex-col",
              displayedTab !== "notes" && "hidden",
            )}
          >
            <MemoizedNotesTab worktreePath={worktreePath} />
          </div>
        )}

        {(displayedTab === "git" || visitedTabs.has("git")) && (
          <div
            className={cn(
              "h-full overflow-hidden flex flex-col",
              displayedTab !== "git" && "hidden",
            )}
          >
            <MemoizedGitTab worktreePath={worktreePath} />
          </div>
        )}
      </div>
    </motion.div>
  );
}
