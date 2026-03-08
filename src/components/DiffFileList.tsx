import {
  Component,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  FilePlus,
  FileMinus,
  FileEdit,
  FileCode,
  ChevronDown,
  Loader,
  AlertTriangle,
} from "lucide-react";
import { DiffView, DiffModeEnum, DiffFile } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view.css";
import { cn } from "../utils/cn";
import type { DiffHighlighter } from "../lib/diff-highlighter";
import type { ChangedFile } from "../types";

/* ── Shared constants ─────────────────────────────────────────────── */

export const COLLAPSED_HEIGHT = 36;

/* ── Utility functions ────────────────────────────────────────────── */

export function getFileIcon(status: ChangedFile["status"]) {
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

export function getStatusColorClass(status: ChangedFile["status"]): string {
  switch (status) {
    case "added":
    case "untracked":
      return "text-semantic-success";
    case "deleted":
      return "text-semantic-error";
    case "modified":
    case "renamed":
    case "copied":
      return "text-semantic-warning";
    default:
      return "text-tertiary";
  }
}

export function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function dirname(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

export function getLangFromPath(path: string): string {
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

/* ── DiffErrorBoundary ────────────────────────────────────────────── */

interface DiffErrorBoundaryProps {
  children: ReactNode;
  fileName: string;
}

interface DiffErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class DiffErrorBoundary extends Component<
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

/* ── FileSection ──────────────────────────────────────────────────── */

export interface FileSectionProps {
  file: ChangedFile;
  isExpanded: boolean;
  onToggle: () => void;
  patch: string | null;
  isLoading: boolean;
  shikiHighlighter: Omit<DiffHighlighter, "getHighlighterEngine"> | null;
  isLightMode: boolean;
  /** When true, wraps the expanded content in a framer-motion animation. */
  animate?: boolean;
}

export function FileSection({
  file,
  isExpanded,
  onToggle,
  patch,
  isLoading,
  shikiHighlighter,
  isLightMode,
  animate = false,
}: FileSectionProps) {
  const reducedMotion = useReducedMotion();
  const Icon = getFileIcon(file.status);
  const statusColorClass = getStatusColorClass(file.status);
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

  const diffContent = (
    <>
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-tertiary">
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
        <div className="px-4 py-8 text-center text-sm text-tertiary">
          No diff available
        </div>
      )}
    </>
  );

  return (
    <div className="bg-background rounded-lg border overflow-clip mb-2 border-border">
      <header
        className={cn(
          "group px-3 py-1.5 font-mono text-xs cursor-pointer transition-colors bg-secondary",
          isExpanded && "border-b border-border"
        )}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
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
              className={cn("absolute inset-0 w-4 h-4 transition-all duration-200 group-hover:opacity-0 group-hover:scale-75", statusColorClass)}
            />
            <ChevronDown
              className={cn(
                "absolute inset-0 w-4 h-4 transition-all duration-200 opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 text-tertiary",
                !isExpanded && "-rotate-90"
              )}
            />
          </div>

          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="font-medium truncate text-primary">
              {basename(file.path)}
            </span>
            {dir && (
              <span className="text-[11px] truncate text-tertiary">
                {dir}
              </span>
            )}
          </div>

          <span className="shrink-0 font-mono text-[11px] tabular-nums whitespace-nowrap">
            {file.additions > 0 && (
              <span className="mr-1.5 text-semantic-success">
                +{file.additions}
              </span>
            )}
            {file.deletions > 0 && (
              <span className="text-semantic-error">-{file.deletions}</span>
            )}
          </span>
        </div>
      </header>

      {isExpanded && (
        animate ? (
          <motion.div
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{
              duration: reducedMotion ? 0 : 0.3,
              ease: [0.645, 0.045, 0.355, 1],
            }}
            className="agent-diff-wrapper overflow-hidden"
          >
            {diffContent}
          </motion.div>
        ) : (
          <div className="agent-diff-wrapper">
            {diffContent}
          </div>
        )
      )}
    </div>
  );
}
