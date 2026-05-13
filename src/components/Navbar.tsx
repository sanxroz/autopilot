import { motion, useReducedMotion } from "framer-motion";
import {
  GitBranch,
  Diff,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAppStore } from "../store";
import { cn } from "../utils/cn";

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
  const reducedMotion = useReducedMotion();

  const handleToggleRightPanel = () => {
    setCodeReviewOpen(!codeReviewOpen);
  };

  const worktreeName = selectedWorktree?.name ?? null;
  const branchName = selectedWorktree?.branch ?? null;

  return (
    <div
      data-tauri-drag-region
      className={cn(
        "relative flex items-center justify-between select-none h-[35px] min-h-[35px] pr-3",
        sidebarOpen ? "pl-3" : "pl-[75px]",
      )}
    >
      <button
        onClick={onToggleSidebar}
        className="py-1.5 px-2 transition-colors rounded-md bg-transparent text-tertiary hover:bg-hover hover:text-primary"
        title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
      >
        {sidebarOpen ? (
          <ChevronLeft className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
      </button>

      <div
        data-tauri-drag-region
        className="flex items-center gap-2 text-sm absolute left-1/2 transform -translate-x-1/2 max-w-[50%] overflow-hidden text-secondary"
      >
        {branchName && (
          <>
            <GitBranch className="w-3.5 h-3.5 flex-shrink-0 text-tertiary" />
            <span className="truncate min-w-0 text-primary">{branchName}</span>
            {worktreeName && worktreeName !== branchName && (
              <>
                <span className="flex-shrink-0 text-tertiary">/</span>
                <span className="truncate min-w-0 text-secondary">
                  {worktreeName}
                </span>
              </>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-1 ml-auto">
        {diffViewMode === "overlay" && (
          <motion.button
            onClick={toggleDiffOverlay}
            className={cn(
              "py-1.5 px-2 rounded-md border-none cursor-pointer bg-transparent",
              diffOverlayOpen
                ? "text-accent-primary"
                : "text-tertiary hover:bg-hover hover:text-primary",
            )}
            whileHover={reducedMotion ? {} : { scale: 1.05 }}
            whileTap={reducedMotion ? {} : { scale: 0.95 }}
            transition={{ duration: 0.15 }}
            title="Diff"
            aria-label="Toggle diff overlay"
          >
            <Diff className="w-3.5 h-3.5" />
          </motion.button>
        )}
        <motion.button
          onClick={handleToggleRightPanel}
          className={cn(
            "py-1.5 px-2 rounded-md border-none cursor-pointer bg-transparent",
            codeReviewOpen
              ? "text-accent-primary"
              : "text-tertiary hover:bg-hover hover:text-primary",
          )}
          whileHover={reducedMotion ? {} : { scale: 1.05 }}
          whileTap={reducedMotion ? {} : { scale: 0.95 }}
          transition={{ duration: 0.15 }}
          title="Panel"
          aria-label={codeReviewOpen ? "Close side panel" : "Open side panel"}
        >
          {codeReviewOpen ? (
            <ChevronsRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronsLeft className="w-3.5 h-3.5" />
          )}
        </motion.button>
      </div>
    </div>
  );
}
