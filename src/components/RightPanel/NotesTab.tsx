import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "../../store";

const EXTERNAL_NOTE_SYNC_INTERVAL_MS = 2000;
const LOCAL_EDIT_GRACE_PERIOD_MS = 3000;

interface NotesTabProps {
  readonly worktreePath: string | null;
}

export function NotesTab({ worktreePath }: NotesTabProps) {
  const sidebarNotesMarkdown = useAppStore((state) => state.getSidebarNotesMarkdown(worktreePath));
  const loadSidebarNotesMarkdownFromDisk = useAppStore((state) => state.loadSidebarNotesMarkdownFromDisk);
  const replaceSidebarNotesMarkdown = useAppStore((state) => state.replaceSidebarNotesMarkdown);
  const setSidebarNotesMarkdown = useAppStore((state) => state.setSidebarNotesMarkdown);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const latestMarkdownRef = useRef(sidebarNotesMarkdown);
  const lastLocalEditAtRef = useRef(0);

  latestMarkdownRef.current = sidebarNotesMarkdown;

  const syncExternalNote = useCallback(async () => {
    if (!worktreePath) {
      return;
    }

    if (document.visibilityState !== "visible") {
      return;
    }

    if (document.activeElement === textareaRef.current) {
      return;
    }

    if (Date.now() - lastLocalEditAtRef.current < LOCAL_EDIT_GRACE_PERIOD_MS) {
      return;
    }

    const diskMarkdown = await loadSidebarNotesMarkdownFromDisk(worktreePath);
    if (diskMarkdown !== latestMarkdownRef.current) {
      replaceSidebarNotesMarkdown(worktreePath, diskMarkdown);
    }
  }, [loadSidebarNotesMarkdownFromDisk, replaceSidebarNotesMarkdown, worktreePath]);

  useEffect(() => {
    if (!worktreePath) {
      return;
    }

    void syncExternalNote();

    const intervalId = window.setInterval(() => {
      void syncExternalNote();
    }, EXTERNAL_NOTE_SYNC_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncExternalNote();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [syncExternalNote, worktreePath]);

  if (!worktreePath) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-secondary">
        Select a worktree to view its private notes.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border-subtle px-4 py-2.5">
        <p className="text-xs font-medium text-primary">Worktree Notes</p>
        <p className="truncate text-[11px] text-secondary">
          Live sync checks the saved note while this tab is open. Agents can update it with `bun run note`.
        </p>
      </div>
      <div className="min-h-0 flex-1 px-4 py-3">
        <label className="flex h-full min-h-0 flex-col">
          <textarea
            ref={textareaRef}
            value={sidebarNotesMarkdown}
            onChange={(event) => {
              lastLocalEditAtRef.current = Date.now();
              void setSidebarNotesMarkdown(worktreePath, event.target.value);
            }}
            placeholder={"# Worktree notes\n\n- Draft thoughts\n- TODOs\n- Links\n\n```bash\nbun run build\n```"}
            className="min-h-0 flex-1 resize-none rounded-lg border border-border-subtle bg-secondary px-3 py-3 text-[13px] leading-6 text-primary outline-none transition-colors placeholder:text-muted focus:border-accent-primary select-text"
            style={{ fontFamily: '"Departure Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
            aria-label="Worktree notes editor"
            spellCheck={false}
          />
        </label>
      </div>
    </div>
  );
}
