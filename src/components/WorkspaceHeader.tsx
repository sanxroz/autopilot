import { PanelLeft, PanelRight, Search, X } from "lucide-react";
import { useAppStore } from "../store";
import { formatShortcut } from "../lib/keyboard-shortcuts";
import type { WorktreeInfo } from "../types";
import { cn } from "../utils/cn";
import {
  RightPanelToolbar,
  type RightPanelTabId,
} from "./RightPanelToolbar";

interface WorkspaceHeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenCommandMenu: () => void;
  headerWorktree?: WorktreeInfo | null;
  rightPanelTab: RightPanelTabId;
  onRightPanelTabChange: (tab: RightPanelTabId) => void;
}

export function WorkspaceHeader({
  sidebarOpen,
  onToggleSidebar,
  onOpenCommandMenu,
  headerWorktree,
  rightPanelTab,
  onRightPanelTabChange,
}: WorkspaceHeaderProps) {
  const selectedWorktree = useAppStore((state) => state.selectedWorktree);
  const terminalTabs = useAppStore((state) => state.currentTerminalTabs);
  const activeTerminalTabId = useAppStore(
    (state) => state.currentActiveTerminalTabId,
  );
  const createTerminalTab = useAppStore((state) => state.createTerminalTab);
  const closeTerminalTab = useAppStore((state) => state.closeTerminalTab);
  const setActiveTerminalTab = useAppStore(
    (state) => state.setActiveTerminalTab,
  );
  const codeReviewOpen = useAppStore((state) => state.codeReviewOpen);
  const setCodeReviewOpen = useAppStore((state) => state.setCodeReviewOpen);
  const commandMenuShortcut = useAppStore(
    (state) => state.keyboardShortcuts.commandMenu,
  );
  const sidebarShortcut = useAppStore(
    (state) => state.keyboardShortcuts.toggleSidebar,
  );

  const displayedWorktree = headerWorktree ?? selectedWorktree;
  const canCreateTab = Boolean(selectedWorktree && !headerWorktree);
  const workspaceName = displayedWorktree?.name ?? displayedWorktree?.branch;
  const visibleTabs = headerWorktree
    ? [{ id: `captain:${headerWorktree.path}` }]
    : terminalTabs;

  return (
    <header
      className={cn(
        "flex h-9 min-h-9 items-center gap-0.5 pr-0.5 select-none",
        sidebarOpen ? "pl-0.5" : "pl-[75px]",
      )}
    >
      <button
        type="button"
        onClick={onToggleSidebar}
        className="flex h-7 w-9 shrink-0 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-hover hover:text-primary active:scale-[0.97] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2"
        title={`${sidebarOpen ? "Hide" : "Show"} sidebar (${formatShortcut(sidebarShortcut)})`}
        aria-label={`${sidebarOpen ? "Hide" : "Show"} sidebar, ${formatShortcut(sidebarShortcut)}`}
      >
        <PanelLeft className="h-4 w-4" strokeWidth={1.5} />
      </button>

      <button
        type="button"
        onClick={onOpenCommandMenu}
        className="flex h-7 w-9 shrink-0 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-hover hover:text-primary active:scale-[0.97] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2"
        title={`Command menu (${formatShortcut(commandMenuShortcut)})`}
        aria-label={`Open command menu, ${formatShortcut(commandMenuShortcut)}`}
      >
        <Search className="h-4 w-4" strokeWidth={1.5} />
      </button>

      <div
        role="tablist"
        aria-label="Terminal layouts"
        className="flex min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-hide"
      >
        {visibleTabs.map((tab, index) => {
          const isActive = Boolean(headerWorktree) || tab.id === activeTerminalTabId;
          const label = index === 0
            ? workspaceName ?? "Workspace"
            : `${workspaceName ?? "Workspace"} ${index + 1}`;

          const canClose = !headerWorktree && terminalTabs.length > 1;

          return (
            <div
              key={tab.id}
              className={cn(
                "group flex h-6 max-w-44 shrink-0 items-center rounded-md transition-colors",
                isActive
                  ? "bg-active text-primary shadow-[inset_0_0_0_1px_var(--color-border-default)]"
                  : "text-tertiary hover:bg-hover hover:text-secondary",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  if (!headerWorktree) setActiveTerminalTab(tab.id);
                }}
                className="flex h-full min-w-0 flex-1 items-center px-3 text-[12px] font-medium focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2"
                title={label}
              >
                <span className="truncate">{label}</span>
              </button>
              {canClose && (
                <button
                  type="button"
                  onClick={() => closeTerminalTab(tab.id)}
                  className="pointer-events-none mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted opacity-0 transition-colors hover:bg-hover hover:text-primary group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1"
                  aria-label={`Close ${label}`}
                  title="Close terminal layout"
                >
                  <X className="h-3 w-3" strokeWidth={1.75} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => void createTerminalTab()}
        disabled={!canCreateTab}
        className="flex h-6 w-8 shrink-0 items-center justify-center rounded-md text-sm text-tertiary transition-colors hover:bg-hover hover:text-primary active:scale-[0.97] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 disabled:cursor-default disabled:text-muted disabled:hover:bg-transparent"
        title={
          canCreateTab
            ? "New terminal layout"
            : "Select a session to create a terminal layout"
        }
        aria-label="New terminal layout"
      >
        +
      </button>

      <div data-tauri-drag-region className="h-full min-w-4 flex-1" />

      <div className="flex min-w-0 max-w-[65%] items-center gap-0.5">
        {codeReviewOpen && (
          <div className="min-w-0 overflow-x-auto scrollbar-hide">
            <RightPanelToolbar
              worktreePath={selectedWorktree?.path ?? null}
              activeTab={rightPanelTab}
              onActiveTabChange={onRightPanelTabChange}
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => setCodeReviewOpen(!codeReviewOpen)}
          className={cn(
            "flex h-6 w-8 shrink-0 items-center justify-center rounded-md transition-colors active:scale-[0.97] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2",
            codeReviewOpen
              ? "text-primary"
              : "text-secondary hover:bg-hover hover:text-primary",
          )}
          title={codeReviewOpen ? "Close workspace panel" : "Open Git changes"}
          aria-label={codeReviewOpen ? "Close workspace panel" : "Open Git changes"}
          aria-pressed={codeReviewOpen}
        >
          <PanelRight className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
