import {
  Component,
  useEffect,
  useCallback,
  useState,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  FilePlus,
  FileMinus,
  FileEdit,
  FileCode,
  ChevronDown,
  Loader,
  AlertTriangle,
  ChevronUp,
  ChevronsUpDown,
  Maximize2,
  Check,
  GitPullRequestArrow,
  Laptop,
} from "lucide-react";
import { DiffView, DiffModeEnum, DiffFile } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view.css";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTheme, useThemeMode } from "../../hooks/useTheme";
import { useCodeReview } from "../../hooks/useCodeReview";
import { useAppStore } from "../../store";
import {
  getDiffHighlighter,
  type DiffHighlighter,
} from "../../lib/diff-highlighter";
import type { ChangedFile } from "../../types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface DiffErrorBoundaryProps {
  children: ReactNode;
  fileName: string;
}

interface DiffErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class DiffErrorBoundary extends Component<
  DiffErrorBoundaryProps,
  DiffErrorBoundaryState
> {
  constructor(props: DiffErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): DiffErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex items-center gap-2 p-4 text-sm rounded-md"
          style={{
            color: "#fbbf24",
            background: "rgba(251, 191, 36, 0.1)",
          }}
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>Failed to render diff for this file.</span>
        </div>
      );
    }
    return this.props.children;
  }
}

interface DiffTabProps {
  worktreePath: string | null;
}

function getFileIcon(status: ChangedFile["status"]) {
  switch (status) {
    case "added":
    case "untracked":
      return FilePlus;
    case "deleted":
      return FileMinus;
    case "modified":
    case "renamed":
    case "copied":
      return FileEdit;
    default:
      return FileCode;
  }
}

function getStatusColor(status: ChangedFile["status"]) {
  switch (status) {
    case "added":
    case "untracked":
      return "#22C55E";
    case "deleted":
      return "#EF4444";
    case "modified":
    case "renamed":
    case "copied":
      return "#F59E0B";
    default:
      return "#6B7280";
  }
}

function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

function dirname(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

function getLangFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    rs: "rust",
    py: "python",
    rb: "ruby",
    go: "go",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    css: "css",
    scss: "scss",
    html: "html",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    sql: "sql",
    sh: "bash",
    toml: "toml",
    xml: "xml",
  };
  return langMap[ext] || "plaintext";
}

const COLLAPSED_HEIGHT = 36;

interface FileSectionProps {
  file: ChangedFile;
  isExpanded: boolean;
  onToggle: () => void;
  patch: string | null;
  isLoading: boolean;
  shikiHighlighter: Omit<DiffHighlighter, "getHighlighterEngine"> | null;
  isLightMode: boolean;
}

function FileSection({
  file,
  isExpanded,
  onToggle,
  patch,
  isLoading,
  shikiHighlighter,
  isLightMode,
}: FileSectionProps) {
  const theme = useTheme();
  const Icon = getFileIcon(file.status);
  const statusColor = getStatusColor(file.status);
  const dir = dirname(file.path);
  const diffFileRef = useRef<DiffFile | null>(null);

  const diffFile = useMemo(() => {
    if (!patch || !isExpanded) return null;

    const lang = getLangFromPath(file.path);
    try {
      const instance = DiffFile.createInstance({
        oldFile: { fileName: file.path, fileLang: lang, content: null },
        newFile: { fileName: file.path, fileLang: lang, content: null },
        hunks: [patch],
      });

      instance.initTheme("dark");
      instance.init();
      instance.buildUnifiedDiffLines();

      diffFileRef.current = instance;
      return instance;
    } catch (e) {
      console.error("Failed to create diff instance:", e);
      return null;
    }
  }, [patch, isExpanded, file.path]);

  useEffect(() => {
    return () => {
      if (diffFileRef.current) {
        diffFileRef.current.clear();
        diffFileRef.current = null;
      }
    };
  }, []);

  return (
    <div
      className="bg-background rounded-lg border overflow-clip mb-2"
      style={{ borderColor: theme.border.default }}
    >
      <header
        className="group px-3 py-1.5 font-mono text-xs cursor-pointer transition-colors"
        style={{
          background: theme.bg.secondary,
          borderBottom: isExpanded
            ? `1px solid ${theme.border.default}`
            : undefined,
        }}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <div className="relative w-4 h-4 shrink-0">
            <Icon
              className="absolute inset-0 w-4 h-4 transition-all duration-200 group-hover:opacity-0 group-hover:scale-75"
              style={{ color: statusColor }}
            />
            <ChevronDown
              className={`absolute inset-0 w-4 h-4 transition-all duration-200 opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 ${
                !isExpanded ? "-rotate-90" : ""
              }`}
              style={{ color: theme.text.tertiary }}
            />
          </div>

          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              className="font-medium truncate"
              style={{ color: theme.text.primary }}
            >
              {basename(file.path)}
            </span>
            {dir && (
              <span
                className="text-[11px] truncate"
                style={{ color: theme.text.tertiary }}
              >
                {dir}
              </span>
            )}
          </div>

          <span className="shrink-0 font-mono text-[11px] tabular-nums whitespace-nowrap">
            {file.additions > 0 && (
              <span className="mr-1.5" style={{ color: "#22C55E" }}>
                +{file.additions}
              </span>
            )}
            {file.deletions > 0 && (
              <span style={{ color: "#EF4444" }}>-{file.deletions}</span>
            )}
          </span>
        </div>
      </header>

      {isExpanded && (
        <div className="agent-diff-wrapper">
          {isLoading ? (
            <div
              className="flex items-center justify-center gap-2 py-8"
              style={{ color: theme.text.tertiary }}
            >
              <Loader className="w-3.5 h-3.5 animate-spin" />
              <span className="text-sm">Loading diff...</span>
            </div>
          ) : diffFile ? (
            <DiffErrorBoundary fileName={file.path}>
              <DiffView
                diffFile={diffFile}
                diffViewMode={DiffModeEnum.Unified}
                diffViewWrap={false}
                diffViewTheme={isLightMode ? "light" : "dark"}
                diffViewHighlight={!!shikiHighlighter}
                registerHighlighter={shikiHighlighter as any}
              />
            </DiffErrorBoundary>
          ) : (
            <div
              className="px-4 py-8 text-center text-sm"
              style={{ color: theme.text.tertiary }}
            >
              No diff available
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DiffTab({ worktreePath }: DiffTabProps) {
  const theme = useTheme();
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
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderColor: theme.border.default }}
      >
        <div className="flex items-center gap-2 text-xs">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-medium transition-colors hover:bg-opacity-80"
                style={{
                  color: theme.text.primary,
                }}
              >
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
          <span
            className="px-1.5 py-0.5 rounded"
            style={{
              background: theme.bg.tertiary,
              color: theme.text.tertiary,
            }}
          >
            {changedFiles.length} files
          </span>
          {totalAdditions > 0 && (
            <span className="font-mono" style={{ color: "#22C55E" }}>
              +{totalAdditions}
            </span>
          )}
          {totalDeletions > 0 && (
            <span className="font-mono" style={{ color: "#EF4444" }}>
              -{totalDeletions}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {changedFiles.length > 0 && (
            <button
              onClick={allExpanded ? collapseAll : expandAll}
              className="p-1 rounded transition-colors flex items-center gap-1 text-xs"
              style={{ color: theme.text.tertiary }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = theme.bg.hover;
                e.currentTarget.style.color = theme.text.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = theme.text.tertiary;
              }}
              title={allExpanded ? "Collapse all" : "Expand all"}
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
            className="p-1 rounded transition-colors"
            style={{ color: theme.text.tertiary }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = theme.bg.hover;
              e.currentTarget.style.color = theme.text.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = theme.text.tertiary;
            }}
            title="Expand to overlay"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-auto p-2">
        {isLoading ? (
          <div
            className="flex items-center justify-center h-full text-sm"
            style={{ color: theme.text.secondary }}
          >
            Loading changes...
          </div>
        ) : changedFiles.length === 0 ? (
          <div
            className="flex items-center justify-center h-full text-sm"
            style={{ color: theme.text.tertiary }}
          >
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
