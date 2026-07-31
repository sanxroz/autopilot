import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  X,
  Eye,
  Code2,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { useAppStore } from "../store";
import { useThemeMode } from "../hooks/useTheme";
import { cn } from "../utils/cn";
import { DiffErrorBoundary, PatchFileDiff } from "./DiffFileList";
import {
  markdownSanitizeSchema,
  MarkdownErrorBoundary,
  markdownComponents,
} from "../lib/markdown-components";
import {
  getCachedGitFileDiff,
  getGitFileDiffKey,
  invalidateGitFileDiffCache,
  loadGitFileDiff,
} from "../lib/git-file-diff-cache";
import type { FileDiffData } from "../types";

function getFileName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1];
}

function isMarkdownFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".mdx");
}

export function GitFileDiffOverlay() {
  const themeMode = useThemeMode();
  const preview = useAppStore((state) => state.gitFileDiffPreview);
  const setPreview = useAppStore((state) => state.setGitFileDiffPreview);
  const filePath = preview?.filePath ?? null;
  const worktreePath = preview?.worktreePath ?? null;
  const isStaged = preview?.isStaged ?? false;
  const isMd = filePath ? isMarkdownFile(filePath) : false;

  const [loadedDiff, setLoadedDiff] = useState<{
    key: string;
    data: FileDiffData;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"diff" | "preview">("diff");
  const lastSavedContentRef = useRef<string | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{
    worktreePath: string;
    filePath: string;
    content: string;
    version: number;
  } | null>(null);
  const saveInFlightRef = useRef(false);
  const editVersionRef = useRef(0);
  const activeTargetRef = useRef({ worktreePath, filePath });
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  activeTargetRef.current = { worktreePath, filePath };

  const requestKey =
    worktreePath && filePath
      ? getGitFileDiffKey(worktreePath, filePath, isStaged)
      : "";
  const diffData =
    loadedDiff?.key === requestKey
      ? loadedDiff.data
      : getCachedGitFileDiff(requestKey);
  const isDiffPending = preview != null && diffData == null;
  const editContent = diffData?.worktree_content ?? diffData?.new_content;
  const isEditable =
    diffData != null &&
    !diffData.is_binary &&
    editContent != null;

  useEffect(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    pendingSaveRef.current = null;
    editVersionRef.current += 1;
    setViewMode("diff");
    lastSavedContentRef.current = null;
    setIsDirty(false);
  }, [filePath]);

  useEffect(() => {
    if (!filePath || !worktreePath) {
      setLoadedDiff(null);
      setError(null);
      return;
    }

    const cached = getCachedGitFileDiff(requestKey);
    if (cached) {
      setLoadedDiff({ key: requestKey, data: cached });
      lastSavedContentRef.current =
        !cached.is_binary
          ? (cached.worktree_content ?? cached.new_content ?? null)
          : null;
      setError(null);
      return;
    }

    let cancelled = false;

    const loadDiff = async () => {
      setError(null);
      try {
        const diff = await loadGitFileDiff(worktreePath, filePath, isStaged);
        if (!cancelled) {
          setLoadedDiff({ key: requestKey, data: diff });
          lastSavedContentRef.current =
            !diff.is_binary
              ? (diff.worktree_content ?? diff.new_content ?? null)
              : null;
          setIsDirty(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
          setLoadedDiff(null);
        }
      }
    };

    void loadDiff();

    return () => {
      cancelled = true;
    };
  }, [filePath, worktreePath, isStaged, requestKey]);

  const stats = useMemo(() => {
    let added = 0;
    let deleted = 0;

    for (const line of diffData?.patch.split("\n") ?? []) {
      if (line.startsWith("+") && !line.startsWith("+++")) added++;
      if (line.startsWith("-") && !line.startsWith("---")) deleted++;
    }

    return { added, deleted };
  }, [diffData?.patch]);
  const diffOptions = useMemo(
    () => ({
      themeType: themeMode,
      diffStyle: "unified" as const,
      diffIndicators: "bars" as const,
      disableFileHeader: true,
      hunkSeparators: "line-info" as const,
      lineDiffType: "word-alt" as const,
      overflow: "scroll" as const,
    }),
    [themeMode],
  );

  const handleClose = useCallback(() => {
    if (isDirty && !window.confirm("Discard your unsaved edits?")) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    pendingSaveRef.current = null;
    setPreview(null);
  }, [isDirty, setPreview]);

  const flushAutosave = useCallback(async () => {
    if (saveInFlightRef.current || !pendingSaveRef.current) return;

    saveInFlightRef.current = true;
    setIsSaving(true);
    try {
      while (pendingSaveRef.current) {
        const pendingSave = pendingSaveRef.current;
        pendingSaveRef.current = null;

        try {
          await invoke("save_worktree_file", {
            worktreePath: pendingSave.worktreePath,
            filePath: pendingSave.filePath,
            content: pendingSave.content,
          });
          invalidateGitFileDiffCache(pendingSave.worktreePath);

          if (
            pendingSave.worktreePath === activeTargetRef.current.worktreePath &&
            pendingSave.filePath === activeTargetRef.current.filePath &&
            pendingSave.version === editVersionRef.current
          ) {
            lastSavedContentRef.current = pendingSave.content;
            setIsDirty(false);
          }
        } catch (saveError) {
          pendingSaveRef.current = pendingSave;
          toast.error(
            `Failed to autosave ${getFileName(pendingSave.filePath)}: ${String(saveError)}`,
          );
          break;
        }
      }
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  }, []);

  const handleEditChange = useCallback(
    (contents: string) => {
      editVersionRef.current += 1;

      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }

      const needsSave =
        contents !== lastSavedContentRef.current || saveInFlightRef.current;
      setIsDirty(needsSave);

      if (!needsSave || !worktreePath || !filePath) {
        pendingSaveRef.current = null;
        return;
      }

      pendingSaveRef.current = {
        worktreePath,
        filePath,
        content: contents,
        version: editVersionRef.current,
      };
      autosaveTimerRef.current = setTimeout(() => {
        autosaveTimerRef.current = null;
        void flushAutosave();
      }, 600);
    },
    [filePath, flushAutosave, worktreePath],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && isEditable) {
        e.preventDefault();
        if (autosaveTimerRef.current) {
          clearTimeout(autosaveTimerRef.current);
          autosaveTimerRef.current = null;
        }
        void flushAutosave();
      } else if (e.key === "Escape" && preview) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [preview, isEditable, handleClose, flushAutosave]);

  if (!preview) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 z-20 flex flex-col bg-primary diff-overlay",
        themeMode === "light" && "light-mode",
      )}
    >
      <div
        data-tauri-drag-region
        className="flex h-9 min-h-9 flex-shrink-0 select-none items-center justify-between border-b border-border-subtle bg-primary px-3"
      >
        <div data-tauri-drag-region className="min-w-0 flex-1 pr-4">
          <span className="block truncate font-mono text-[12px] font-medium leading-none text-secondary">
            {preview.filePath}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {stats.added > 0 && (
            <span className="font-mono text-[11px] tabular-nums text-semantic-success">
              +{stats.added}
            </span>
          )}
          {stats.deleted > 0 && (
            <span className="font-mono text-[11px] tabular-nums text-semantic-error">
              −{stats.deleted}
            </span>
          )}
          <span
            className="w-12 text-right text-[10px] text-muted"
            aria-live="polite"
          >
            {isSaving ? "Saving…" : ""}
          </span>
          <div className="flex items-center gap-0.5">
            {isMd && (
              <button
                onClick={() =>
                  setViewMode(viewMode === "preview" ? "diff" : "preview")
                }
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                  "text-tertiary hover:bg-hover hover:text-primary",
                )}
                aria-label={
                  viewMode === "preview" ? "Show diff" : "Show preview"
                }
                title={viewMode === "preview" ? "Show diff" : "Show preview"}
              >
                {viewMode === "preview" ? (
                  <Code2 className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            <button
              onClick={handleClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-hover hover:text-primary"
              aria-label="Close diff preview"
              title="Close preview"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="h-full min-w-0">
          {!error && isDiffPending ? (
            <div className="h-full" />
          ) : error ? (
            <div className="px-4 py-12 text-center text-sm text-semantic-error">{error}</div>
          ) : viewMode === "preview" && isMd ? (
            diffData?.new_content != null ? (
              <MarkdownErrorBoundary key={filePath} rawContent={diffData.new_content ?? ""}>
                <article
                  className="mx-auto"
                  style={{
                    maxWidth: 720,
                    padding: "2.5em 2em 4em",
                    fontFamily: "Georgia, 'Times New Roman', serif",
                    fontSize: "16.5px",
                    lineHeight: 1.85,
                    WebkitFontSmoothing: "antialiased",
                  }}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]]}
                    components={markdownComponents}
                  >
                    {diffData.new_content}
                  </ReactMarkdown>
                </article>
              </MarkdownErrorBoundary>
            ) : (
              <div className="px-4 py-12 text-center text-sm text-tertiary">
                No preview available for this file
              </div>
            )
          ) : diffData?.is_binary ? (
            <div className="px-4 py-12 text-center text-sm text-tertiary">
              Binary file — text preview unavailable
            </div>
          ) : diffData?.patch ? (
            <DiffErrorBoundary fileName={preview.filePath}>
              <PatchFileDiff
                patch={diffData.patch}
                cacheKey={requestKey}
                options={diffOptions}
                filePath={preview.filePath}
                oldContent={diffData.old_content}
                newContent={editContent}
                edit={isEditable}
                onEditChange={isEditable ? handleEditChange : undefined}
              />
            </DiffErrorBoundary>
          ) : (
            <div className="px-4 py-12 text-center text-sm text-tertiary">
              No changes in this file
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
