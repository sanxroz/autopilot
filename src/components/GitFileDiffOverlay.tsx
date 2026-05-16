import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { X, Loader, Eye, Code2, ChevronsRight, ChevronsLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { useAppStore } from "../store";
import { cn } from "../utils/cn";
import {
  markdownSanitizeSchema,
  MarkdownErrorBoundary,
  markdownComponents,
} from "../lib/markdown-components";
import type { FileDiffData } from "../types";

interface DiffLine {
  type: "context" | "add" | "del" | "hunk-header" | "meta";
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

interface EditIndicator {
  top: number;
  height: number;
  type: "add" | "del";
}

const LINE_HEIGHT = 20;

function parsePatch(patch: string): DiffLine[] {
  if (!patch || patch.trim() === "") return [];

  const rows: DiffLine[] = [];
  const lines = patch.split("\n");
  let oldLineNum = 0;
  let newLineNum = 0;
  let inHunk = false;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    if (line === "" && index === lines.length - 1) {
      continue;
    }

    if (
      line.startsWith("diff --git") ||
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ")
    ) {
      continue;
    }

    if (line.startsWith("@@")) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLineNum = parseInt(match[1], 10);
        newLineNum = parseInt(match[2], 10);
      }
      inHunk = true;
      rows.push({ type: "hunk-header", content: line });
      continue;
    }

    if (!inHunk) {
      continue;
    }

    if (line.startsWith("+")) {
      rows.push({
        type: "add",
        content: line.substring(1),
        newLineNum,
      });
      newLineNum++;
      continue;
    }

    if (line.startsWith("-")) {
      rows.push({
        type: "del",
        content: line.substring(1),
        oldLineNum,
      });
      oldLineNum++;
      continue;
    }

    if (line.startsWith(" ")) {
      rows.push({
        type: "context",
        content: line.substring(1),
        oldLineNum,
        newLineNum,
      });
      oldLineNum++;
      newLineNum++;
      continue;
    }

    if (line.startsWith("\\")) {
      rows.push({ type: "meta", content: line });
    }
  }

  return rows;
}

function getFileName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1];
}

function isMarkdownFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".mdx");
}

export function GitFileDiffOverlay() {
  const preview = useAppStore((state) => state.gitFileDiffPreview);
  const setPreview = useAppStore((state) => state.setGitFileDiffPreview);
  const codeReviewOpen = useAppStore((state) => state.codeReviewOpen);
  const setCodeReviewOpen = useAppStore((state) => state.setCodeReviewOpen);

  const [diffData, setDiffData] = useState<FileDiffData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"diff" | "preview">("diff");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  const filePath = preview?.filePath ?? null;
  const worktreePath = preview?.worktreePath ?? null;
  const isStaged = preview?.isStaged ?? false;
  const isMd = filePath ? isMarkdownFile(filePath) : false;

  useEffect(() => {
    setViewMode(isMd ? "preview" : "diff");
  }, [filePath, isMd]);

  useEffect(() => {
    if (!filePath || !worktreePath) {
      setDiffData(null);
      setError(null);
      hasScrolledRef.current = false;
      return;
    }

    let cancelled = false;
    hasScrolledRef.current = false;

    const loadDiff = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const diff = await invoke<FileDiffData>("get_uncommitted_diff", {
          worktreePath,
          filePath,
          isStaged,
          includeContent: isMd,
        });
        if (!cancelled) {
          setDiffData(diff);
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
          setDiffData(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadDiff();

    return () => {
      cancelled = true;
    };
  }, [filePath, worktreePath, isStaged, isMd]);

  const diffLines = useMemo(() => {
    if (!diffData?.patch) return [];
    return parsePatch(diffData.patch);
  }, [diffData?.patch]);

  const firstChangeIndex = useMemo(
    () => diffLines.findIndex((line) => line.type === "add" || line.type === "del"),
    [diffLines]
  );

  const rowVirtualizer = useVirtualizer({
    count: diffLines.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => LINE_HEIGHT,
    overscan: 20,
  });

  useEffect(() => {
    if (viewMode === "preview") return;
    if (firstChangeIndex < 0 || isLoading || hasScrolledRef.current) return;

    hasScrolledRef.current = true;
    rowVirtualizer.scrollToOffset(Math.max(0, (firstChangeIndex - 3) * LINE_HEIGHT));
  }, [firstChangeIndex, isLoading, rowVirtualizer, viewMode]);

  const stats = useMemo(() => {
    let added = 0;
    let deleted = 0;

    for (const line of diffLines) {
      if (line.type === "add") added++;
      if (line.type === "del") deleted++;
    }

    return { added, deleted };
  }, [diffLines]);

  const editIndicators = useMemo(() => {
    if (diffLines.length === 0) return [] as EditIndicator[];

    const indicators: EditIndicator[] = [];
    let runStart = -1;
    let runType: "add" | "del" | null = null;

    const flushRun = (endIndex: number) => {
      if (runStart < 0 || !runType) return;
      indicators.push({
        top: runStart / diffLines.length,
        height: Math.max((endIndex - runStart + 1) / diffLines.length, 0.003),
        type: runType,
      });
      runStart = -1;
      runType = null;
    };

    diffLines.forEach((line, index) => {
      if (line.type !== "add" && line.type !== "del") {
        flushRun(index - 1);
        return;
      }

      if (runType === line.type) {
        return;
      }

      flushRun(index - 1);
      runStart = index;
      runType = line.type;
    });

    flushRun(diffLines.length - 1);
    return indicators;
  }, [diffLines]);

  const handleClose = useCallback(() => {
    setPreview(null);
  }, [setPreview]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && preview) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [preview, handleClose]);

  if (!preview) return null;

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-primary">
      <div
        data-tauri-drag-region
        className="flex items-center justify-between select-none flex-shrink-0 h-[35px] min-h-[35px] px-3 border-b border-border bg-secondary"
      >
        <div data-tauri-drag-region className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-sm font-medium text-primary truncate">
            {getFileName(preview.filePath)}
          </span>
          <span className="text-[11px] px-1.5 py-0.5 rounded text-tertiary bg-tertiary">
            {preview.isStaged ? "staged" : "unstaged"}
          </span>
          {viewMode === "diff" && (
            <span className="text-[11px] px-1.5 py-0.5 rounded text-tertiary bg-tertiary">
              changed hunks
            </span>
          )}
          {stats.added > 0 && (
            <span className="text-[11px] font-mono text-semantic-success">+{stats.added}</span>
          )}
          {stats.deleted > 0 && (
            <span className="text-[11px] font-mono text-semantic-error">-{stats.deleted}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isMd && (
            <button
              onClick={() => setViewMode(viewMode === "preview" ? "diff" : "preview")}
              className={cn(
                "p-1 rounded transition-colors",
                "text-tertiary hover:bg-hover hover:text-primary"
              )}
              aria-label={viewMode === "preview" ? "Show diff" : "Show preview"}
              title={viewMode === "preview" ? "Show diff" : "Show preview"}
            >
              {viewMode === "preview" ? (
                <Code2 className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>
          )}
          <button
            onClick={handleClose}
            className="p-1 rounded transition-colors text-tertiary hover:bg-hover hover:text-primary"
            aria-label="Close diff preview"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setCodeReviewOpen(!codeReviewOpen)}
            className={cn(
              "p-1 rounded transition-colors",
              codeReviewOpen
                ? "text-accent-primary"
                : "text-tertiary hover:bg-hover hover:text-primary"
            )}
            title={codeReviewOpen ? "Close panel" : "Open panel"}
            aria-label={codeReviewOpen ? "Close checks and review panel" : "Open checks and review panel"}
          >
            {codeReviewOpen ? (
              <ChevronsRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronsLeft className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        <div ref={scrollContainerRef} className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-tertiary">
              <Loader className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
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
          ) : diffLines.length > 0 ? (
            <div
              className="font-mono text-[13px]"
              style={{
                height: rowVirtualizer.getTotalSize(),
                lineHeight: `${LINE_HEIGHT}px`,
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const line = diffLines[virtualRow.index];
                if (!line) return null;

                if (line.type === "hunk-header" || line.type === "meta") {
                  return (
                    <div
                      key={virtualRow.index}
                      className={cn(
                        "absolute left-0 right-0 px-3 text-[12px]",
                        line.type === "hunk-header"
                          ? "bg-secondary text-tertiary border-y border-border-subtle"
                          : "bg-primary text-muted"
                      )}
                      style={{
                        top: 0,
                        height: `${LINE_HEIGHT}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      {line.content}
                    </div>
                  );
                }

                const isAdd = line.type === "add";
                const isDel = line.type === "del";

                return (
                  <div
                    key={virtualRow.index}
                    className={cn(
                      "absolute left-0 right-0 flex",
                      isAdd && "bg-semantic-success-muted",
                      isDel && "bg-semantic-error-muted"
                    )}
                    style={{
                      top: 0,
                      height: `${LINE_HEIGHT}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <span
                      className={cn(
                        "flex-shrink-0 text-right select-none w-[56px] px-2 text-muted border-r border-border-subtle",
                        !isAdd && !isDel && "bg-secondary"
                      )}
                    >
                      {line.oldLineNum ?? ""}
                    </span>
                    <span
                      className={cn(
                        "flex-shrink-0 text-right select-none w-[56px] px-2 text-muted border-r border-border-subtle",
                        !isAdd && !isDel && "bg-secondary"
                      )}
                    >
                      {line.newLineNum ?? ""}
                    </span>
                    <span
                      className={cn(
                        "flex-shrink-0 select-none text-center w-5",
                        isAdd && "text-semantic-success bg-semantic-success-muted",
                        isDel && "text-semantic-error bg-semantic-error-muted",
                        !isAdd && !isDel && "text-transparent"
                      )}
                    >
                      {isAdd ? "+" : isDel ? "-" : " "}
                    </span>
                    <pre className="flex-1 m-0 pl-2 pr-4 whitespace-pre overflow-visible">
                      {line.content || " "}
                    </pre>
                  </div>
                );
              })}
            </div>
          ) : diffData?.patch?.trim() ? (
            <div className="px-4 py-12 text-center text-sm text-tertiary">
              Diff preview unavailable for this file
            </div>
          ) : (
            <div className="px-4 py-12 text-center text-sm text-tertiary">
              No changes in this file
            </div>
          )}
        </div>

        {editIndicators.length > 0 && viewMode === "diff" && (
          <div className="absolute top-0 right-0 bottom-0 w-1.5 pointer-events-none">
            {editIndicators.map((indicator, index) => (
              <div
                key={index}
                className={cn(
                  "absolute right-0 w-1.5",
                  indicator.type === "add" ? "bg-semantic-success" : "bg-semantic-error"
                )}
                style={{
                  top: `${indicator.top * 100}%`,
                  height: `${indicator.height * 100}%`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
