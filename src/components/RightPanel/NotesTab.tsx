import { useAppStore } from "../../store";

interface NotesTabProps {
  readonly worktreePath: string | null;
}

export function NotesTab({ worktreePath }: NotesTabProps) {
  const notes = useAppStore((state) => state.getSidebarNotesMarkdown(worktreePath));
  const setNotes = useAppStore((state) => state.setSidebarNotesMarkdown);

  if (!worktreePath) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-secondary">
        Select a worktree to view its notes.
      </div>
    );
  }

  return (
    <label className="flex h-full min-h-0 flex-col px-4 py-3">
      <span className="mb-1.5 text-xs font-medium text-primary">Personal notes</span>
      <textarea
        value={notes}
        onChange={(event) => {
          void setNotes(worktreePath, event.target.value);
        }}
        placeholder="Private notes, TODOs, and links"
        className="min-h-0 flex-1 resize-none rounded-lg border border-border-subtle bg-secondary px-3 py-3 text-[13px] leading-6 text-primary outline-none transition-colors placeholder:text-muted focus:border-accent-primary select-text"
        style={{ fontFamily: '"Departure Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
        aria-label="Personal notes"
        spellCheck={false}
      />
    </label>
  );
}
