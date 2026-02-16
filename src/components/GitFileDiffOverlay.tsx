import { Component, useEffect, useState, useMemo, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { codeToTokens, type BundledLanguage } from "shiki";
import { X, Loader, Eye, Code2, ChevronsRight, ChevronsLeft, AlertTriangle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { useThemeMode } from "../hooks/useTheme";
import { useAppStore } from "../store";
import { cn } from "../utils/cn";
import type { FileDiffData } from "../types";

interface LineInfo {
  lineNum: number;
  content: string;
  type: "unchanged" | "added" | "deleted";
  index: number;
}

const LANG_MAP: Record<string, BundledLanguage> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  py: "python",
  rb: "ruby",
  rs: "rust",
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
  bash: "bash",
  toml: "toml",
  xml: "xml",
};

function getLang(filePath: string): BundledLanguage {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  return LANG_MAP[ext] || "plaintext";
}

function parseChangesFromPatch(patch: string): { 
  addedLines: Set<number>; 
  deletedAtLine: Map<number, string[]>;
} {
  const addedLines = new Set<number>();
  const deletedAtLine = new Map<number, string[]>();
  
  if (!patch) return { addedLines, deletedAtLine };

  const lines = patch.split("\n");
  let newLineNum = 0;
  let pendingDeleted: string[] = [];

  for (const line of lines) {
    if (line.startsWith("@@")) {
      if (pendingDeleted.length > 0) {
        deletedAtLine.set(newLineNum, [...pendingDeleted]);
        pendingDeleted = [];
      }
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        newLineNum = parseInt(match[1], 10);
      }
      continue;
    }

    if (line.startsWith("---") || line.startsWith("+++") || 
        line.startsWith("diff ") || line.startsWith("index ")) {
      continue;
    }

    if (line.startsWith("-")) {
      pendingDeleted.push(line.substring(1));
      continue;
    }

    if (line.startsWith("+")) {
      if (pendingDeleted.length > 0) {
        deletedAtLine.set(newLineNum, [...pendingDeleted]);
        pendingDeleted = [];
      }
      addedLines.add(newLineNum);
      newLineNum++;
      continue;
    }

    if (line.startsWith(" ")) {
      if (pendingDeleted.length > 0) {
        deletedAtLine.set(newLineNum, [...pendingDeleted]);
        pendingDeleted = [];
      }
      newLineNum++;
    }
  }

  if (pendingDeleted.length > 0) {
    deletedAtLine.set(newLineNum, [...pendingDeleted]);
  }

  return { addedLines, deletedAtLine };
}

function buildFullFileView(
  newContent: string | null | undefined,
  patch: string
): LineInfo[] {
  const result: LineInfo[] = [];
  
  if (!newContent) {
    return result;
  }

  const { addedLines, deletedAtLine } = parseChangesFromPatch(patch);
  const fileLines = newContent.split("\n");
  let index = 0;

  for (let i = 0; i < fileLines.length; i++) {
    const lineNum = i + 1;
    
    const deletedLines = deletedAtLine.get(lineNum);
    if (deletedLines) {
      for (const deleted of deletedLines) {
        result.push({
          lineNum: -1,
          content: deleted,
          type: "deleted",
          index: index++,
        });
      }
    }

    result.push({
      lineNum,
      content: fileLines[i],
      type: addedLines.has(lineNum) ? "added" : "unchanged",
      index: index++,
    });
  }

  const trailingDeleted = deletedAtLine.get(fileLines.length + 1);
  if (trailingDeleted) {
    for (const deleted of trailingDeleted) {
      result.push({
        lineNum: -1,
        content: deleted,
        type: "deleted",
        index: index++,
      });
    }
  }

  return result;
}

function getFileName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1];
}

function isMarkdownFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".mdx");
}

const markdownSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    input: [...(defaultSchema.attributes?.input || []), "checked", "disabled", "type"],
    img: [...(defaultSchema.attributes?.img || []), "src", "alt"],
    a: [...(defaultSchema.attributes?.a || []), "href", "target", "rel"],
    code: [...(defaultSchema.attributes?.code || []), "className"],
  },
};

interface MarkdownErrorBoundaryProps {
  children: ReactNode;
  rawContent: string;
}

interface MarkdownErrorBoundaryState {
  hasError: boolean;
}

class MarkdownErrorBoundary extends Component<
  MarkdownErrorBoundaryProps,
  MarkdownErrorBoundaryState
> {
  constructor(props: MarkdownErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): MarkdownErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="space-y-3">
          <div
            className="flex items-center gap-2 p-3 text-sm rounded-md"
            style={{ color: "#fbbf24", background: "rgba(251, 191, 36, 0.1)" }}
          >
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>Failed to render markdown preview. Showing raw content instead.</span>
          </div>
          <pre className="font-mono text-[13px] text-secondary whitespace-pre-wrap p-4 overflow-auto">
            {this.props.rawContent}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1
      className="text-primary first:mt-0"
      style={{ fontSize: "1.85em", fontWeight: 700, marginTop: "1.6em", marginBottom: "0.6em", letterSpacing: "-0.02em", lineHeight: 1.25 }}
    >
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2
      className="text-primary pb-2 border-b border-border-subtle"
      style={{ fontSize: "1.45em", fontWeight: 600, marginTop: "1.8em", marginBottom: "0.6em", letterSpacing: "-0.015em", lineHeight: 1.3 }}
    >
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3
      className="text-primary"
      style={{ fontSize: "1.2em", fontWeight: 600, marginTop: "1.6em", marginBottom: "0.5em", lineHeight: 1.35 }}
    >
      {children}
    </h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4
      className="text-primary"
      style={{ fontSize: "1.05em", fontWeight: 600, marginTop: "1.4em", marginBottom: "0.4em", lineHeight: 1.4 }}
    >
      {children}
    </h4>
  ),
  h5: ({ children }: { children?: React.ReactNode }) => (
    <h5
      className="text-secondary"
      style={{ fontSize: "0.95em", fontWeight: 600, marginTop: "1.3em", marginBottom: "0.4em", lineHeight: 1.4, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}
    >
      {children}
    </h5>
  ),
  h6: ({ children }: { children?: React.ReactNode }) => (
    <h6
      className="text-tertiary"
      style={{ fontSize: "0.9em", fontWeight: 600, marginTop: "1.3em", marginBottom: "0.4em", lineHeight: 1.4, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}
    >
      {children}
    </h6>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-secondary" style={{ margin: "1.15em 0", lineHeight: "inherit" }}>{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="text-primary" style={{ fontWeight: 600 }}>{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em style={{ fontStyle: "italic" }}>{children}</em>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-primary"
      style={{ textDecoration: "underline", textDecorationColor: "var(--color-accent-primary)", textUnderlineOffset: "3px", textDecorationThickness: "1px" }}
    >
      {children}
    </a>
  ),
  code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
    const isInline = !className;
    return isInline ? (
      <code
        className="font-mono rounded bg-tertiary text-primary"
        style={{ fontSize: "0.82em", padding: "0.15em 0.4em", fontWeight: 500 }}
        {...props}
      >
        {children}
      </code>
    ) : (
      <code className={cn("font-mono", className)} style={{ fontSize: "0.85em" }} {...props}>{children}</code>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre
      className="font-mono rounded-lg overflow-x-auto bg-secondary border border-border-subtle"
      style={{ fontSize: "13px", lineHeight: 1.65, padding: "1em 1.25em", margin: "1.5em 0" }}
    >
      {children}
    </pre>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="text-secondary" style={{ listStyleType: "disc", paddingLeft: "1.5em", margin: "1em 0" }}>{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="text-secondary" style={{ listStyleType: "decimal", paddingLeft: "1.5em", margin: "1em 0" }}>{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li style={{ lineHeight: "inherit", marginTop: "0.35em", marginBottom: "0.35em", paddingLeft: "0.25em" }}>{children}</li>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote
      className="text-secondary"
      style={{
        borderLeft: "3px solid var(--color-accent-primary)",
        paddingLeft: "1.2em",
        margin: "1.5em 0",
        fontStyle: "italic",
        opacity: 0.9,
      }}
    >
      {children}
    </blockquote>
  ),
  hr: () => (
    <hr
      style={{
        border: "none",
        height: "1px",
        background: "var(--color-border-default)",
        margin: "2.5em auto",
        maxWidth: "30%",
      }}
    />
  ),
  img: ({ src, alt }: { src?: string; alt?: string }) => (
    <img
      src={src}
      alt={alt || ""}
      className="rounded-lg border border-border-subtle"
      style={{ maxWidth: "100%", margin: "1.5em 0" }}
    />
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto" style={{ margin: "1.5em 0" }}>
      <table className="border-collapse w-full" style={{ fontSize: "0.9em" }}>{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="border-b-2 border-border">{children}</thead>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="text-primary text-left" style={{ fontWeight: 600, padding: "0.6em 1em" }}>{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="text-secondary border-b border-border-subtle" style={{ padding: "0.6em 1em" }}>{children}</td>
  ),
  input: ({ type, checked, ...props }: { type?: string; checked?: boolean }) => {
    if (type === "checkbox") {
      return (
        <input
          type="checkbox"
          checked={checked}
          readOnly
          className="mr-2 align-middle rounded accent-accent-primary"
          style={{ width: 14, height: 14 }}
          {...props}
        />
      );
    }
    return <input type={type} {...props} />;
  },
};

interface HighlightedLine {
  tokens: Array<{ content: string; color?: string }>;
}

const LINE_HEIGHT = 20;

export function GitFileDiffOverlay() {
  const themeMode = useThemeMode();
  const isLightMode = themeMode === "light";
  
  const preview = useAppStore((state) => state.gitFileDiffPreview);
  const setPreview = useAppStore((state) => state.setGitFileDiffPreview);
  const codeReviewOpen = useAppStore((state) => state.codeReviewOpen);
  const setCodeReviewOpen = useAppStore((state) => state.setCodeReviewOpen);
  
  const [diffData, setDiffData] = useState<FileDiffData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedLines, setHighlightedLines] = useState<Map<number, HighlightedLine>>(new Map());
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
      setHighlightedLines(new Map());
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

    loadDiff();

    return () => {
      cancelled = true;
    };
  }, [filePath, worktreePath, isStaged]);

  useEffect(() => {
    if (!diffData?.new_content || !filePath) {
      setHighlightedLines(new Map());
      return;
    }

    const highlightCode = async () => {
      try {
        const lang = getLang(filePath);
        const result = await codeToTokens(diffData.new_content!, {
          lang,
          theme: isLightMode ? "github-light" : "github-dark",
        });

        const lineMap = new Map<number, HighlightedLine>();
        result.tokens.forEach((lineTokens, index) => {
          lineMap.set(index + 1, {
            tokens: lineTokens.map(token => ({
              content: token.content,
              color: token.color,
            })),
          });
        });
        setHighlightedLines(lineMap);
      } catch {
        setHighlightedLines(new Map());
      }
    };

    highlightCode();
  }, [diffData?.new_content, filePath, isLightMode]);

  const fileLines = useMemo(() => {
    if (!diffData) return [];
    return buildFullFileView(diffData.new_content, diffData.patch);
  }, [diffData]);

  const firstEditIndex = useMemo(() => {
    return fileLines.findIndex(line => line.type === "added" || line.type === "deleted");
  }, [fileLines]);

  useEffect(() => {
    if (viewMode === "preview") return;
    if (firstEditIndex >= 0 && scrollContainerRef.current && !hasScrolledRef.current && !isLoading) {
      hasScrolledRef.current = true;
      const scrollTop = Math.max(0, (firstEditIndex - 3) * LINE_HEIGHT);
      scrollContainerRef.current.scrollTop = scrollTop;
    }
  }, [firstEditIndex, isLoading, viewMode]);

  const editIndicators = useMemo(() => {
    if (fileLines.length === 0) return [];
    return fileLines
      .filter(line => line.type === "added" || line.type === "deleted")
      .map(line => ({
        position: line.index / fileLines.length,
        type: line.type,
      }));
  }, [fileLines]);

  const stats = useMemo(() => {
    let added = 0;
    let deleted = 0;
    for (const line of fileLines) {
      if (line.type === "added") added++;
      if (line.type === "deleted") deleted++;
    }
    return { added, deleted };
  }, [fileLines]);

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

  const renderLineContent = useCallback((line: LineInfo) => {
    const highlighted = line.lineNum > 0 ? highlightedLines.get(line.lineNum) : null;
    
    if (highlighted && highlighted.tokens.length > 0) {
      return (
        <>
          {highlighted.tokens.map((token, i) => (
            <span key={i} style={{ color: token.color }}>
              {token.content}
            </span>
          ))}
        </>
      );
    }
    
    return line.content || " ";
  }, [highlightedLines]);

  if (!preview) return null;

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-primary">
      <div
        data-tauri-drag-region
        className="flex items-center justify-between select-none flex-shrink-0 h-[35px] min-h-[35px] px-3 border-b border-border bg-secondary"
      >
        <div data-tauri-drag-region className="flex items-center gap-3 flex-1">
          <span className="text-sm font-medium text-primary">
            {getFileName(preview.filePath)}
          </span>
          <span className="text-[11px] px-1.5 py-0.5 rounded text-tertiary bg-tertiary">
            {preview.isStaged ? "staged" : "unstaged"}
          </span>
          {stats.added > 0 && (
            <span className="text-[11px] font-mono text-semantic-success">
              +{stats.added}
            </span>
          )}
          {stats.deleted > 0 && (
            <span className="text-[11px] font-mono text-semantic-error">
              -{stats.deleted}
            </span>
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
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-auto"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-tertiary">
              <Loader className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          ) : error ? (
            <div className="px-4 py-12 text-center text-sm text-semantic-error">
              {error}
            </div>
          ) : viewMode === "preview" && isMd && diffData?.new_content !== undefined ? (
            <MarkdownErrorBoundary rawContent={diffData.new_content ?? ""}>
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
          ) : fileLines.length > 0 ? (
            <div className="font-mono text-[13px]" style={{ lineHeight: `${LINE_HEIGHT}px` }}>
              {fileLines.map((line) => {
                const isAdd = line.type === "added";
                const isDel = line.type === "deleted";

                return (
                  <div
                    key={line.index}
                    className={cn(
                      "flex",
                      isAdd && "bg-semantic-success-muted",
                      isDel && "bg-semantic-error-muted"
                    )}
                    style={{ height: `${LINE_HEIGHT}px` }}
                  >
                    <span
                      className={cn(
                        "flex-shrink-0 text-right select-none w-[50px] px-2 text-muted border-r border-border-subtle",
                        isAdd && "bg-semantic-success-muted",
                        isDel && "bg-semantic-error-muted",
                        !isAdd && !isDel && "bg-secondary"
                      )}
                    >
                      {line.lineNum > 0 ? line.lineNum : ""}
                    </span>
                    <span
                      className={cn(
                        "flex-shrink-0 select-none text-center w-5",
                        isAdd && "text-semantic-success bg-semantic-success-muted",
                        isDel && "text-semantic-error bg-semantic-error-muted",
                        !isAdd && !isDel && "text-transparent"
                      )}
                    >
                      {isAdd ? "+" : isDel ? "-" : ""}
                    </span>
                    <pre className="flex-1 m-0 pl-2 pr-4 whitespace-pre overflow-visible">
                      {renderLineContent(line)}
                    </pre>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-4 py-12 text-center text-sm text-tertiary">
              No changes in this file
            </div>
          )}
        </div>

        {editIndicators.length > 0 && (
          <div className="absolute top-0 right-0 bottom-0 w-1.5 pointer-events-none">
            {editIndicators.map((indicator, i) => (
              <div
                key={i}
                className={cn(
                  "absolute right-0 w-1.5 h-0.5",
                  indicator.type === "added" ? "bg-semantic-success" : "bg-semantic-error"
                )}
                style={{ top: `${indicator.position * 100}%` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
