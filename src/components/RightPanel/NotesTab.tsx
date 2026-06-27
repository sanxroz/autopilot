import { useAppStore } from "../../store";

export function NotesTab() {
  const sidebarNotesMarkdown = useAppStore((state) => state.sidebarNotesMarkdown);
  const setSidebarNotesMarkdown = useAppStore((state) => state.setSidebarNotesMarkdown);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 px-4 py-3">
        <label className="flex h-full min-h-0 flex-col">
          <textarea
            value={sidebarNotesMarkdown}
            onChange={(event) => void setSidebarNotesMarkdown(event.target.value)}
            placeholder={"# Notes\n\n- Draft thoughts\n- TODOs\n- Links\n\n```bash\nbun run build\n```"}
            className="min-h-0 flex-1 resize-none rounded-lg border border-border-subtle bg-secondary px-3 py-3 text-[13px] leading-6 text-primary outline-none transition-colors placeholder:text-muted focus:border-accent-primary select-text"
            style={{ fontFamily: '"Departure Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
            aria-label="Markdown notes editor"
            spellCheck={false}
          />
        </label>
      </div>
    </div>
  );
}
