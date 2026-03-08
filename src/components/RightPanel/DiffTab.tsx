import {
  useEffect,
  useCallback,
  useState,
  useRef,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Maximize2,
  Check,
  GitPullRequestArrow,
  Laptop,
} from "lucide-react";
import "@git-diff-view/react/styles/diff-view.css";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useThemeMode } from "../../hooks/useTheme";
import { useCodeReview } from "../../hooks/useCodeReview";
import { useAppStore } from "../../store";
import {
  getDiffHighlighter,
  type DiffHighlighter,
} from "../../lib/diff-highlighter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { FileSection, COLLAPSED_HEIGHT } from "../DiffFileList";

interface DiffTabProps {
  worktreePath: string | null;
}

export function DiffTab({ worktreePath }: DiffTabProps) {
  const themeMode = useThemeMode();
  const isLightMode = themeMode === "light";
  const setDiffViewMode = useAppStore((state) => state.setDiffViewMode);
  const setDiffOverlayOpen = useAppStore((state) => state.setDiffOverlayOpen);

  const handleExpandToOverlay = () => {
    setDiffViewMode("overlay");
    setDiffOverlayOpen(true);
  };
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [shikiHighlighter, setShikiHighlighter] = useState<Omit<
    DiffHighlighter,
    "getHighlighterEngine"
  > | null>(null);

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
    <div
      className={`flex flex-col h-full diff-overlay ${isLightMode ? "light-mode" : ""}`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-border">
        <div className="flex items-center gap-2 text-xs">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-medium transition-colors hover:bg-opacity-80 text-primary">
                {diffMode === "local" ? (
                  <>
                    <Laptop className="w-3.5 h-3.5" />
                    Local
                  </>
                ) : (
                  <>
                    <GitPullRequestArrow className="w-3.5 h-3.5" />
                    Branch
                  </>
                )}
                <ChevronDown className="w-3.5 h-3.5 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setDiffMode("local")}>
                <Laptop className="w-3.5 h-3.5" />
                <span>Local</span>
                {diffMode === "local" && (
                  <Check className="w-3.5 h-3.5 ml-auto" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDiffMode("branch")}>
                <GitPullRequestArrow className="w-3.5 h-3.5" />
                <span>Branch</span>
                {diffMode === "branch" && (
                  <Check className="w-3.5 h-3.5 ml-auto" />
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
            onClick={handleExpandToOverlay}
            className="p-1 rounded transition-colors text-tertiary hover:bg-hover hover:text-primary"
            title="Expand to overlay"
            aria-label="Expand to overlay"
          >
            <Maximize2 className="w-3.5 h-3.5" />
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
    </div>
  );
}
