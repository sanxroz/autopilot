import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
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

export function NotesTab({ worktreePath }: NotesTabProps) {
  const sidebarNotesMarkdown = useAppStore((state) => state.getSidebarNotesMarkdown(worktreePath));
  const setSidebarNotesMarkdown = useAppStore((state) => state.setSidebarNotesMarkdown);
  const [contextMarkdown, setContextMarkdown] = useState("");
  const [contextError, setContextError] = useState<string | null>(null);
  const contextTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const latestContextRef = useRef(contextMarkdown);
  const worktreePathRef = useRef(worktreePath);
  const lastLocalEditAtRef = useRef(0);
  const localEditVersionRef = useRef(0);
  const hasUnsavedContextRef = useRef(false);

  latestContextRef.current = contextMarkdown;
  worktreePathRef.current = worktreePath;

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
  }, [worktreePath]);

  useEffect(() => {
    if (!worktreePath) {
      setContextMarkdown("");
      return;
    }

    localEditVersionRef.current += 1;
    lastLocalEditAtRef.current = 0;
    hasUnsavedContextRef.current = false;
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
      <label className="flex min-h-52 flex-[3] flex-col">
        <span className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-primary">Current work</span>
          <span className="font-mono text-[10px] text-tertiary">.autopilot.md</span>
        </span>
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
            void saveAutopilotContext(worktreePath, markdown)
              .then(() => {
                if (
                  worktreePathRef.current === worktreePath &&
                  localEditVersionRef.current === editVersion
                ) {
                  hasUnsavedContextRef.current = false;
                  setContextError(null);
                }
              })
              .catch((error) => {
                if (
                  worktreePathRef.current === worktreePath &&
                  localEditVersionRef.current === editVersion
                ) {
                  setContextError(error instanceof Error ? error.message : String(error));
                }
              });
          }}
          placeholder={"# Current work\n\n**Status:** Working\n**Objective:**\n**Current state:**\n**Remaining:**\n**Next action:**\n**Blocked by:** Nothing"}
          className="min-h-0 flex-1 resize-none rounded-lg border border-border-subtle bg-secondary px-3 py-3 text-[13px] leading-6 text-primary outline-none transition-colors placeholder:text-muted focus:border-accent-primary select-text"
          style={{ fontFamily: '"Departure Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
          aria-label="Current work snapshot"
          aria-invalid={contextError ? true : undefined}
          aria-describedby={contextError ? "autopilot-context-error" : undefined}
          spellCheck={false}
        />
        {contextError && (
          <span id="autopilot-context-error" className="mt-1 text-xs text-semantic-error" role="alert">
            Could not access current work: {contextError}
          </span>
        )}
      </label>

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
