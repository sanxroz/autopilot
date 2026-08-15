import { invoke } from "@tauri-apps/api/core";
import { Check, Pencil } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import {
  MarkdownErrorBoundary,
  markdownComponents,
  markdownSanitizeSchema,
} from "../../lib/markdown-components";
import { useAppStore } from "../../store";

const EXTERNAL_NOTE_SYNC_INTERVAL_MS = 2000;
const LOCAL_EDIT_GRACE_PERIOD_MS = 3000;
let contextSaveQueue = Promise.resolve();

function saveAutopilotContext(worktreePath: string, markdown: string): Promise<void> {
  contextSaveQueue = contextSaveQueue
    .catch(() => undefined)
    .then(() => invoke("write_autopilot_context", { worktreePath, markdown }));
  return contextSaveQueue;
}

async function loadAutopilotContext(worktreePath: string): Promise<string> {
  await contextSaveQueue.catch(() => undefined);
  return invoke<string>("read_autopilot_context", { worktreePath });
}

interface NotesTabProps {
  readonly worktreePath: string | null;
}

const currentWorkMarkdownComponents = {
  ...markdownComponents,
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="mb-3 mt-8 text-balance text-[16px] font-semibold leading-6 tracking-[-0.01em] text-primary first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mb-3 mt-8 text-balance text-[14px] font-semibold leading-5 text-primary first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mb-2 mt-6 text-balance text-[13px] font-semibold leading-5 text-primary first:mt-0">
      {children}
    </h3>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="my-3 leading-[1.65] text-primary first:mt-0 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="my-3 list-disc space-y-1.5 pl-[1.15rem] text-primary">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="my-3 list-decimal space-y-1.5 pl-[1.15rem] text-primary">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="pl-1 leading-[1.65] marker:text-tertiary">{children}</li>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="my-4 border-l-2 border-border pl-3 italic leading-[1.7] text-secondary">
      {children}
    </blockquote>
  ),
  img: ({ alt }: { alt?: string }) => (
    <span className="text-secondary">{alt || "Image omitted"}</span>
  ),
};

const currentWorkActionClassName =
  "absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-md border border-border-subtle bg-gradient-to-b from-hover/70 to-secondary/40 text-secondary shadow-md backdrop-blur-sm backdrop-saturate-150 outline-none transition-[opacity,transform,color] duration-150 ease-out before:absolute before:-inset-2 active:scale-[0.96] hover:text-primary focus-visible:ring-1 focus-visible:ring-border motion-reduce:transition-none";

export function NotesTab({ worktreePath }: NotesTabProps) {
  const sidebarNotesMarkdown = useAppStore((state) => state.getSidebarNotesMarkdown(worktreePath));
  const setSidebarNotesMarkdown = useAppStore((state) => state.setSidebarNotesMarkdown);
  const [contextMarkdown, setContextMarkdown] = useState("");
  const [contextError, setContextError] = useState<string | null>(null);
  const [isEditingContext, setIsEditingContext] = useState(false);
  const contextContainerRef = useRef<HTMLDivElement | null>(null);
  const contextTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const latestContextRef = useRef(contextMarkdown);
  const worktreePathRef = useRef(worktreePath);
  const lastLocalEditAtRef = useRef(0);
  const localEditVersionRef = useRef(0);
  const hasUnsavedContextRef = useRef(false);
  const pendingContextSaveVersionRef = useRef<number | null>(null);

  latestContextRef.current = contextMarkdown;
  worktreePathRef.current = worktreePath;

  useEffect(() => {
    if (isEditingContext) {
      contextTextareaRef.current?.focus();
    }
  }, [isEditingContext]);

  useEffect(() => {
    if (!isEditingContext) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !contextContainerRef.current?.contains(event.target)) {
        setIsEditingContext(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isEditingContext]);

  const persistContext = useCallback(
    (saveWorktreePath: string, markdown: string, editVersion: number) => {
      pendingContextSaveVersionRef.current = editVersion;
      void saveAutopilotContext(saveWorktreePath, markdown)
        .then(() => {
          if (
            worktreePathRef.current === saveWorktreePath &&
            localEditVersionRef.current === editVersion
          ) {
            pendingContextSaveVersionRef.current = null;
            hasUnsavedContextRef.current = false;
            setContextError(null);
          }
        })
        .catch((error) => {
          if (
            worktreePathRef.current === saveWorktreePath &&
            localEditVersionRef.current === editVersion
          ) {
            pendingContextSaveVersionRef.current = null;
            setContextError(error instanceof Error ? error.message : String(error));
          }
        });
    },
    [],
  );

  const syncExternalContext = useCallback(async () => {
    if (!worktreePath) {
      return;
    }

    if (document.visibilityState !== "visible") {
      return;
    }

    if (document.activeElement === contextTextareaRef.current) {
      return;
    }

    if (Date.now() - lastLocalEditAtRef.current < LOCAL_EDIT_GRACE_PERIOD_MS) {
      return;
    }

    if (hasUnsavedContextRef.current) {
      const editVersion = localEditVersionRef.current;
      if (pendingContextSaveVersionRef.current !== editVersion) {
        persistContext(worktreePath, latestContextRef.current, editVersion);
      }
      return;
    }

    const editVersion = localEditVersionRef.current;
    try {
      const diskMarkdown = await loadAutopilotContext(worktreePath);
      if (
        worktreePathRef.current !== worktreePath ||
        document.activeElement === contextTextareaRef.current ||
        hasUnsavedContextRef.current ||
        localEditVersionRef.current !== editVersion
      ) {
        return;
      }
      if (diskMarkdown !== latestContextRef.current) {
        setContextMarkdown(diskMarkdown);
      }
      setContextError(null);
    } catch (error) {
      if (worktreePathRef.current !== worktreePath) return;
      setContextError(error instanceof Error ? error.message : String(error));
    }
  }, [persistContext, worktreePath]);

  useEffect(() => {
    if (!worktreePath) {
      setContextMarkdown("");
      return;
    }

    localEditVersionRef.current += 1;
    lastLocalEditAtRef.current = 0;
    hasUnsavedContextRef.current = false;
    pendingContextSaveVersionRef.current = null;
    setIsEditingContext(false);
    setContextMarkdown("");
    setContextError(null);
    void syncExternalContext();

    const intervalId = window.setInterval(() => {
      void syncExternalContext();
    }, EXTERNAL_NOTE_SYNC_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncExternalContext();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [syncExternalContext, worktreePath]);

  if (!worktreePath) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-secondary">
        Select a worktree to view its notes.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto px-4 py-3">
      <section className="flex min-h-52 flex-[3] flex-col">
        {isEditingContext ? (
          <div ref={contextContainerRef} className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border-subtle bg-secondary">
            <textarea
              ref={contextTextareaRef}
              value={contextMarkdown}
              onChange={(event) => {
                const markdown = event.target.value;
                const editVersion = ++localEditVersionRef.current;
                lastLocalEditAtRef.current = Date.now();
                hasUnsavedContextRef.current = true;
                latestContextRef.current = markdown;
                setContextMarkdown(markdown);
                setContextError(null);
                persistContext(worktreePath, markdown, editVersion);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  setIsEditingContext(false);
                }
              }}
              placeholder="Write a short handoff: what we are doing, where it stands, what matters, and what comes next."
              className="h-full min-h-0 w-full resize-none border-0 bg-transparent px-4 py-4 pb-12 text-[13px] leading-6 text-primary outline-none placeholder:text-muted select-text"
              style={{ fontFamily: '"Departure Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
              aria-label="Current work snapshot"
              aria-keyshortcuts="Meta+Enter Control+Enter"
              aria-invalid={contextError ? true : undefined}
              aria-describedby={contextError ? "autopilot-context-error" : undefined}
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setIsEditingContext(false)}
              className={currentWorkActionClassName}
              aria-label="Show rendered current work"
            >
              <Check className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div
            className="group/current-work relative min-h-0 flex-1 cursor-text overflow-hidden rounded-xl border border-border-subtle bg-secondary text-[14px] text-primary select-text"
            onDoubleClick={() => setIsEditingContext(true)}
          >
            <article className="h-full overflow-y-auto px-4 py-4 pb-12 antialiased">
              {contextMarkdown ? (
                <MarkdownErrorBoundary key={contextMarkdown} rawContent={contextMarkdown}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]]}
                    components={currentWorkMarkdownComponents}
                  >
                    {contextMarkdown}
                  </ReactMarkdown>
                </MarkdownErrorBoundary>
              ) : (
                <p className="text-muted">No current work yet. Double-click to edit.</p>
              )}
            </article>
            <button
              type="button"
              onClick={() => setIsEditingContext(true)}
              className={`${currentWorkActionClassName} opacity-0 group-hover/current-work:opacity-100 group-focus-within/current-work:opacity-100`}
              aria-label="Edit current work"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        )}
        {contextError && (
          <span id="autopilot-context-error" className="mt-1 text-xs text-semantic-error" role="alert">
            Could not access current work: {contextError}
          </span>
        )}
      </section>

      <label className="flex min-h-40 flex-[2] flex-col">
        <span className="mb-1.5 text-xs font-medium text-primary">Personal notes</span>
        <textarea
          value={sidebarNotesMarkdown}
          onChange={(event) => {
            void setSidebarNotesMarkdown(worktreePath, event.target.value);
          }}
          placeholder={"Private notes, TODOs, and links"}
          className="min-h-0 flex-1 resize-none rounded-lg border border-border-subtle bg-secondary px-3 py-3 text-[13px] leading-6 text-primary outline-none transition-colors placeholder:text-muted focus:border-accent-primary select-text"
          style={{ fontFamily: '"Departure Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
          aria-label="Personal notes"
          spellCheck={false}
        />
      </label>
    </div>
  );
}
