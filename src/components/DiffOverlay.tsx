import {
  useEffect,
  useCallback,
  useState,
  useRef,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  X,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  PanelRight,
  Maximize2,
  Check,
  GitPullRequestArrow,
  Laptop,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useThemeMode } from "../hooks/useTheme";
import { cn } from "../utils/cn";
import { useCodeReview } from "../hooks/useCodeReview";
import { useAppStore } from "../store";
import {
  getDiffHighlighter,
  type DiffHighlighter,
} from "../lib/diff-highlighter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { FileSection, COLLAPSED_HEIGHT } from "./DiffFileList";

interface DiffOverlayProps {
  worktreePath: string | null;
  onClose: () => void;
  asSidebar?: boolean;
}

const MIN_SIDEBAR_WIDTH = 300;
const MAX_SIDEBAR_WIDTH = 800;
const DEFAULT_SIDEBAR_WIDTH = 500;

export function DiffOverlay({
  worktreePath,
  onClose,
  asSidebar = false,
}: DiffOverlayProps) {
  const themeMode = useThemeMode();
  const isLightMode = themeMode === "light";
  const reducedMotion = useReducedMotion();
  const setDiffViewMode = useAppStore((state) => state.setDiffViewMode);
  const setCodeReviewOpen = useAppStore((state) => state.setCodeReviewOpen);

  const handleMoveToSidebar = () => {
    setDiffViewMode("sidebar");
    setCodeReviewOpen(true);
    onClose();
  };
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [shikiHighlighter, setShikiHighlighter] = useState<Omit<
    DiffHighlighter,
    "getHighlighterEngine"
  > | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarContainerRef = useRef<HTMLDivElement>(null);
  const sidebarWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!asSidebar) return;
      e.preventDefault();
      sidebarWidthRef.current = sidebarWidth;
      setIsResizing(true);
    },
    [asSidebar, sidebarWidth],
  );

  useEffect(() => {
    if (!isResizing || !asSidebar) return;

    const handleMouseMove = (e: MouseEvent) => {
      const containerRight = window.innerWidth;
      const newWidth = Math.min(
        MAX_SIDEBAR_WIDTH,
        Math.max(MIN_SIDEBAR_WIDTH, containerRight - e.clientX),
      );
      sidebarWidthRef.current = newWidth;
      if (sidebarContainerRef.current) {
        sidebarContainerRef.current.style.width = `${newWidth}px`;
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setSidebarWidth(sidebarWidthRef.current);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, asSidebar]);

  useEffect(() => {
    let cancelled = false;
    getDiffHighlighter()
      .then((highlighter) => {
        if (!cancelled) {
          setShikiHighlighter(highlighter);
        }
      })
      .catch((err) => {
        console.error("Failed to load diff highlighter:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    changedFiles,
    isLoading,
    getDiff,
    loadDiff,
    isDiffLoading,
    diffMode,
    setDiffMode,
  } = useCodeReview(worktreePath);

  const loadingQueueRef = useRef<string[]>([]);
  const isLoadingRef = useRef(false);

  useEffect(() => {
    if (changedFiles.length > 0) {
      setExpandedFiles(new Set(changedFiles.map((f) => f.path)));
      loadingQueueRef.current = changedFiles.map((f) => f.path);
    }
  }, [changedFiles]);

  useEffect(() => {
    const loadNext = async () => {
      if (isLoadingRef.current || loadingQueueRef.current.length === 0) return;

      const nextPath = loadingQueueRef.current.find(
        (p) => !getDiff(p) && !isDiffLoading(p),
      );

      if (!nextPath) {
        loadingQueueRef.current = [];
        return;
      }

      isLoadingRef.current = true;
      await loadDiff(nextPath);
      isLoadingRef.current = false;

      loadingQueueRef.current = loadingQueueRef.current.filter(
        (p) => p !== nextPath,
      );
      loadNext();
    };

    loadNext();
  }, [changedFiles, getDiff, isDiffLoading, loadDiff]);

  const toggleFile = useCallback((path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedFiles(new Set(changedFiles.map((f) => f.path)));
  }, [changedFiles]);

  const collapseAll = useCallback(() => {
    setExpandedFiles(new Set());
  }, []);

  const allExpanded =
    changedFiles.length > 0 && expandedFiles.size === changedFiles.length;
  const allCollapsed = expandedFiles.size === 0;

  const virtualizer = useVirtualizer({
    count: changedFiles.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => {
      const file = changedFiles[index];
      if (!file) return COLLAPSED_HEIGHT;
      const isExpanded = expandedFiles.has(file.path);
      if (!isExpanded) return COLLAPSED_HEIGHT;
      const lineCount = file.additions + file.deletions;
      return Math.min(Math.max(lineCount * 22 + COLLAPSED_HEIGHT, 150), 800);
    },
    overscan: 5,
  });

  const totalAdditions = changedFiles.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = changedFiles.reduce((sum, f) => sum + f.deletions, 0);

  return (
    <motion.div
      ref={asSidebar ? sidebarContainerRef : undefined}
      initial={
        asSidebar
          ? false
          : reducedMotion
            ? { opacity: 1 }
            : { opacity: 0, scale: 0.95 }
      }
      animate={{ opacity: 1, scale: 1 }}
      exit={
        asSidebar
          ? undefined
          : reducedMotion
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.95 }
      }
      transition={{
        duration: reducedMotion ? 0 : 0.25,
        ease: [0.215, 0.61, 0.355, 1], // cubic-out
      }}
      className={cn(
        "flex flex-col diff-overlay bg-primary",
        asSidebar ? "relative border-l border-border" : "absolute inset-0 z-20",
        isLightMode && "light-mode"
      )}
      style={asSidebar ? {
        width: `${sidebarWidth}px`,
        minWidth: `${MIN_SIDEBAR_WIDTH}px`,
        maxWidth: `${MAX_SIDEBAR_WIDTH}px`,
      } : undefined}
    >
      {asSidebar && (
        <div
          onMouseDown={handleMouseDown}
          className={cn(
            "absolute top-0 left-0 w-1 h-full cursor-col-resize z-10 transition-colors",
            isResizing ? "bg-border-strong" : "bg-transparent"
          )}
        />
      )}
      <div
        data-tauri-drag-region
        className="flex items-center justify-between px-4 shrink-0 h-[35px] min-h-[35px]"
      >
        <div data-tauri-drag-region className="flex items-center gap-3">
          <span className="text-sm font-medium text-primary">
            Changes
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-2 py-1 rounded-md text-sm font-medium transition-colors hover:bg-opacity-80 text-primary">
                {diffMode === "local" ? (
                  <>
                    <Laptop className="w-3.5 h-3.5" />
                    <span className="text-medium">Local</span>
                  </>
                ) : (
                  <>
                    <GitPullRequestArrow className="w-3.5 h-3.5" />
                    <span className="text-medium">Branch</span>
                  </>
                )}
                <ChevronDown className="w-3.5 h-3.5 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setDiffMode("local")}>
                <Laptop className="w-3.5 h-3.5" />
                <span>Local</span>
                {diffMode === "local" && <Check className="w-3.5 h-3.5 ml-auto" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDiffMode("branch")}>
                <GitPullRequestArrow className="w-3.5 h-3.5" />
                <span>Branch</span>
                {diffMode === "branch" && <Check className="w-3.5 h-3.5 ml-auto" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-1.5 py-0.5 rounded bg-tertiary text-tertiary">
              {changedFiles.length} files
            </span>
            {totalAdditions > 0 && (
              <span className="font-mono text-semantic-success">
                +{totalAdditions}
              </span>
            )}
            {totalDeletions > 0 && (
              <span className="font-mono text-semantic-error">
                -{totalDeletions}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {changedFiles.length > 0 && (
            <button
              onClick={allExpanded ? collapseAll : expandAll}
              className="p-1 rounded transition-colors flex items-center gap-1 text-xs text-tertiary hover:bg-hover hover:text-primary"
              title={allExpanded ? "Collapse all" : "Expand all"}
              aria-label={allExpanded ? "Collapse all files" : "Expand all files"}
            >
              {allExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : allCollapsed ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronsUpDown className="w-3.5 h-3.5" />
              )}
            </button>
          )}
          <button
            onClick={handleMoveToSidebar}
            className="p-1 rounded transition-colors text-tertiary hover:bg-hover hover:text-primary"
            title={asSidebar ? "Expand to overlay" : "Move to sidebar"}
            aria-label={asSidebar ? "Expand to overlay" : "Move to sidebar"}
          >
            {asSidebar ? (
              <Maximize2 className="w-3.5 h-3.5" />
            ) : (
              <PanelRight className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors text-tertiary hover:bg-hover hover:text-primary"
            aria-label="Close diff view"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-sm text-secondary">
            Loading changes...
          </div>
        ) : changedFiles.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-tertiary">
            No changes detected
          </div>
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const file = changedFiles[virtualRow.index];
              if (!file) return null;
              const diff = getDiff(file.path);
              return (
                <div
                  key={file.path}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <FileSection
                    file={file}
                    isExpanded={expandedFiles.has(file.path)}
                    onToggle={() => toggleFile(file.path)}
                    patch={diff?.patch || null}
                    isLoading={isDiffLoading(file.path)}
                    shikiHighlighter={shikiHighlighter}
                    isLightMode={isLightMode}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
