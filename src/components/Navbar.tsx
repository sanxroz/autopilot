import { GitBranch, PanelRight } from "lucide-react";
import { useAppStore } from "../store";
import { useTheme } from "../hooks/useTheme";

export function Navbar() {
  const selectedWorktree = useAppStore((state) => state.selectedWorktree);
  const codeReviewOpen = useAppStore((state) => state.codeReviewOpen);
  const toggleCodeReview = useAppStore((state) => state.toggleCodeReview);
  const theme = useTheme();

  const worktreeName = selectedWorktree?.name ?? null;
  const branchName = selectedWorktree?.branch ?? null;

  return (
    <div
      data-tauri-drag-region
      className="flex justify-between px-3 select-none"
      style={{
        height: "35px",
        minHeight: "35px",
      }}
    >

      <div
        data-tauri-drag-region
        className="flex items-center gap-2 text-sm"
        style={{ color: theme.text.secondary }}
      >
        {branchName ? (
          <>
            <GitBranch
              className="w-3.5 h-3.5 flex-shrink-0"
              style={{ color: theme.text.tertiary }}
            />
            <span style={{ color: theme.text.primary }}>{branchName}</span>
            {worktreeName && worktreeName !== branchName && (
              <>
                <span style={{ color: theme.text.tertiary }}>/</span>
                <span style={{ color: theme.text.secondary }}>
                  {worktreeName}
                </span>
              </>
            )}
          </>
        ) : (
          <span style={{ color: theme.text.tertiary }}>No workspace selected</span>
        )}
      </div>

      <div className="flex items-center gap-1 w-24 justify-end">
        <button
          onClick={toggleCodeReview}
          className="py-1.5 px-2 transition-colors rounded-md"
          style={{
            background: "transparent",
            color: codeReviewOpen ? theme.accent.primary : theme.text.tertiary,
          }}
          onMouseEnter={(e) => {
            if (!codeReviewOpen) {
              e.currentTarget.style.background = theme.bg.hover;
              e.currentTarget.style.color = theme.text.primary;
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            if (!codeReviewOpen) {
              e.currentTarget.style.color = theme.text.tertiary;
            }
          }}
          title="Code Review"
        >
          <PanelRight className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
