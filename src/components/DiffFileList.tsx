import {
  Component,
  useMemo,
  type ComponentProps,
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
import { parseDiffFromFile, parsePatchFiles } from "@pierre/diffs";
import { FileDiff as PierreFileDiff } from "@pierre/diffs/react";
import type { EditorOptions } from "@pierre/diffs/edit";
import { cn } from "../utils/cn";
import type { ChangedFile, FileDiffData } from "../types";

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

interface PatchFileDiffProps {
  patch: string;
  cacheKey: string;
  options: ComponentProps<typeof PierreFileDiff>["options"];
  filePath?: string;
  oldContent?: string | null;
  newContent?: string | null;
  edit?: boolean;
  onEditChange?: (contents: string) => void;
}

export function PatchFileDiff({
  patch,
  cacheKey,
  options,
  filePath,
  oldContent,
  newContent,
  edit = false,
  onEditChange,
}: PatchFileDiffProps) {
  const fileDiff = useMemo(() => {
    if (edit && filePath && newContent != null) {
      return {
        ...parseDiffFromFile(
          oldContent == null
            ? null
            : {
                name: filePath,
                contents: oldContent,
                cacheKey: `${cacheKey}:old`,
              },
          {
            name: filePath,
            contents: newContent,
            cacheKey: `${cacheKey}:new`,
          },
        ),
        cacheKey,
      };
    }

    return parsePatchFiles(patch, cacheKey)[0]?.files[0];
  }, [cacheKey, edit, filePath, newContent, oldContent, patch]);
  const editorOptions = useMemo<EditorOptions<undefined> | undefined>(
    () =>
      onEditChange
        ? { onChange: (file) => onEditChange(file.contents) }
        : undefined,
    [onEditChange],
  );

  if (!fileDiff) return null;

  return (
    <PierreFileDiff
      fileDiff={fileDiff}
      options={options}
      edit={edit}
      editorOptions={editorOptions}
    />
  );
}

/* ── FileSection ──────────────────────────────────────────────────── */

export interface FileSectionProps {
  file: ChangedFile;
  isExpanded: boolean;
  onToggle: () => void;
  diff: FileDiffData | null;
  isLoading: boolean;
  isLightMode: boolean;
  /** When true, wraps the expanded content in a framer-motion animation. */
  animate?: boolean;
}

export function FileSection({
  file,
  isExpanded,
  onToggle,
  diff,
  isLoading,
  isLightMode,
  animate = false,
}: FileSectionProps) {
  const reducedMotion = useReducedMotion();
  const Icon = getFileIcon(file.status);
  const statusColorClass = getStatusColorClass(file.status);
  const dir = dirname(file.path);
  const diffOptions = useMemo(
    () => ({
      themeType: isLightMode ? "light" as const : "dark" as const,
      diffStyle: "unified" as const,
      diffIndicators: "bars" as const,
      disableFileHeader: true,
      hunkSeparators: "line-info" as const,
      lineDiffType: "word-alt" as const,
      overflow: "scroll" as const,
    }),
    [isLightMode],
  );
  const hasTextDiff = Boolean(diff?.patch);

  const diffContent = (
    <>
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-tertiary">
          <Loader className="w-3.5 h-3.5 animate-spin" />
          <span className="text-sm">Loading diff...</span>
        </div>
      ) : diff?.is_binary ? (
        <div className="px-4 py-8 text-center text-sm text-tertiary">
          Binary file — text preview unavailable
        </div>
      ) : diff && hasTextDiff ? (
        <DiffErrorBoundary fileName={file.path}>
          <PatchFileDiff
            patch={diff.patch}
            cacheKey={`${file.path}:${diff.patch}`}
            options={diffOptions}
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
