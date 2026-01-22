import { GitBranch, Diff, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useAppStore } from "../store";
import { useTheme } from "../hooks/useTheme";

interface NavbarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function Navbar({ sidebarOpen, onToggleSidebar }: NavbarProps) {
  const selectedWorktree = useAppStore((state) => state.selectedWorktree);
  const diffOverlayOpen = useAppStore((state) => state.diffOverlayOpen);
  const toggleDiffOverlay = useAppStore((state) => state.toggleDiffOverlay);
  const diffViewMode = useAppStore((state) => state.diffViewMode);
  const codeReviewOpen = useAppStore((state) => state.codeReviewOpen);
  const setCodeReviewOpen = useAppStore((state) => state.setCodeReviewOpen);
  const theme = useTheme();

  const handleToggleRightPanel = () => {
    setCodeReviewOpen(!codeReviewOpen);
  };

  const worktreeName = selectedWorktree?.name ?? null;
  const branchName = selectedWorktree?.branch ?? null;

  return (
    <div
      data-tauri-drag-region
      className="relative flex items-center justify-between select-none"
      style={{
        height: "35px",
        minHeight: "35px",
        paddingLeft: sidebarOpen ? "12px" : "75px",
        paddingRight: "12px",
      }}
    >
      <button
        onClick={onToggleSidebar}
        className="py-1.5 px-2 transition-colors rounded-md"
        style={{
          background: "transparent",
          color: theme.text.tertiary,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = theme.bg.hover;
          e.currentTarget.style.color = theme.text.primary;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = theme.text.tertiary;
        }}
        title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
      >
        {sidebarOpen ? (
          <ChevronLeft className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
      </button>

      {/* Center content - branch info */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 text-sm absolute left-1/2 transform -translate-x-1/2"
        style={{ color: theme.text.secondary }}
      >
        {branchName && (
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
        )}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1 ml-auto">
        {diffViewMode === 'overlay' && (
          <button
            onClick={toggleDiffOverlay}
            className="py-1.5 px-2 transition-colors rounded-md"
            style={{
              background: "transparent",
              color: diffOverlayOpen ? theme.accent.primary : theme.text.tertiary,
            }}
            onMouseEnter={(e) => {
              if (!diffOverlayOpen) {
                e.currentTarget.style.background = theme.bg.hover;
                e.currentTarget.style.color = theme.text.primary;
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              if (!diffOverlayOpen) {
                e.currentTarget.style.color = theme.text.tertiary;
              }
            }}
            title="Diff"
            aria-label="Toggle diff overlay"
          >
            <Diff className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={handleToggleRightPanel}
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
          title="Checks & Review"
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
  );
}
