import * as React from "react";
import {
  AppWindow,
  FileText,
  FolderPlus,
  GitBranch,
  GitCompare,
  Keyboard,
  PanelLeft,
  PanelRight,
  PanelsTopLeft,
  Plus,
  Search,
  Settings,
  Sun,
  Moon,
  Terminal,
  X,
  type LucideIcon,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import * as CommandMenuUI from "./ui/command-menu";
import { useThemeMode } from "../hooks/useTheme";
import { useAppStore } from "../store";
import {
  formatShortcut,
  SHORTCUT_DEFINITIONS,
  type ShortcutAction,
} from "../lib/keyboard-shortcuts";
import {
  getSessionSearchStatuses,
  type SessionSearchStatus,
} from "../lib/session-search";
import { cn } from "../utils/cn";
import { getNavigableSessions } from "../lib/session-navigation";

interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRunAction: (action: ShortcutAction) => void;
}

const actionIcons: Partial<Record<ShortcutAction, LucideIcon>> = {
  settings: Settings,
  toggleSidebar: PanelLeft,
  toggleWorkspacePanel: PanelRight,
  focusTerminal: Terminal,
  previousTerminal: Terminal,
  nextTerminal: Terminal,
  previousSession: GitBranch,
  nextSession: GitBranch,
  previousLayout: PanelsTopLeft,
  nextLayout: PanelsTopLeft,
  showGit: GitCompare,
  showNotes: FileText,
  openWith: AppWindow,
};

const statusDotClasses: Record<SessionSearchStatus["tone"], string> = {
  muted: "bg-border-strong",
  info: "bg-semantic-info",
  success: "bg-semantic-success",
  warning: "bg-semantic-warning",
  error: "bg-semantic-error",
};

export function CommandMenu({ open: isOpen, onOpenChange, onRunAction }: CommandMenuProps) {
  const themeMode = useThemeMode();
  const [search, setSearch] = React.useState("");

  const repositories = useAppStore((state) => state.repositories);
  const addRepository = useAppStore((state) => state.addRepository);
  const selectWorktree = useAppStore((state) => state.selectWorktree);
  const setThemeMode = useAppStore((state) => state.setThemeMode);
  const selectedWorktree = useAppStore((state) => state.selectedWorktree);
  const createWorktreeAuto = useAppStore((state) => state.createWorktreeAuto);
  const prStatusByWorktreePath = useAppStore((state) => state.prStatusByWorktreePath);
  const processStatusByPath = useAppStore((state) => state.processStatusByPath);
  const agentRunByWorktreePath = useAppStore((state) => state.agentRunByWorktreePath);
  const agentSidebarLifecycleEnabled = useAppStore(
    (state) => state.agentSidebarLifecycleEnabled,
  );
  const keyboardShortcuts = useAppStore((state) => state.keyboardShortcuts);

  const allWorktrees = React.useMemo(() => {
    return getNavigableSessions(repositories.map((repo) => ({
      worktrees: repo.worktrees.map((wt) => ({
        ...wt,
        repoName: repo.info.name,
        repoPath: repo.info.path,
      })),
    })),
    );
  }, [repositories]);

  React.useEffect(() => {
    if (!isOpen) {
      setSearch("");
    }
  }, [isOpen]);

  const handleAddRepository = async () => {
    onOpenChange(false);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Repository",
      });
      if (selected) {
        await addRepository(selected as string);
      }
    } catch (e) {
      console.error("Failed to add repository:", e);
    }
  };

  const handleNewWorkspace = async () => {
    onOpenChange(false);
    if (repositories.length > 0) {
      const created = await createWorktreeAuto(repositories[0].info.path);
      if (created) {
        await selectWorktree(created);
      }
    }
  };

  const handleRunAction = (action: ShortcutAction) => {
    onOpenChange(false);
    onRunAction(action);
  };

  const handleToggleTheme = () => {
    onOpenChange(false);
    setThemeMode(themeMode === "dark" ? "light" : "dark");
  };

  const handleSelectWorktree = async (worktree: typeof allWorktrees[0]) => {
    onOpenChange(false);
    await selectWorktree(worktree);
  };

  return (
    <CommandMenuUI.Dialog open={isOpen} onOpenChange={onOpenChange}>
      <CommandMenuUI.DialogTitle className="sr-only">
        Search sessions and commands
      </CommandMenuUI.DialogTitle>
      <CommandMenuUI.DialogDescription className="sr-only">
        Switch sessions or run an application command.
      </CommandMenuUI.DialogDescription>

      <div className="group/cmd-input flex h-14 items-center gap-3 border-b border-subtle px-4">
        <Search className="h-[18px] w-[18px] shrink-0 text-secondary" aria-hidden="true" />
        <CommandMenuUI.Input
          value={search}
          onValueChange={setSearch}
          placeholder="Search sessions, branches, or commands…"
          aria-label="Search sessions and commands"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          className="h-full text-[15px] text-primary"
        />
        <div className="flex h-11 w-11 shrink-0 items-center justify-center">
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="flex h-11 w-11 items-center justify-center rounded-md text-tertiary hover:bg-hover hover:text-primary active:scale-[0.97]"
              aria-label="Clear search"
              title="Clear search"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <CommandMenuUI.List className="max-h-[min(520px,calc(100dvh-12rem))] overflow-y-auto bg-secondary [scroll-padding-block:0.5rem]">
        <CommandMenuUI.Empty>
          <Search className="mx-auto mb-3 h-5 w-5 text-muted" aria-hidden="true" />
          <p className="text-sm text-secondary">
            {search ? `No results for “${search}”` : "No sessions or commands"}
          </p>
          <p className="mt-1 text-xs text-tertiary">
            Try a session, branch, repository, or command.
          </p>
        </CommandMenuUI.Empty>
        {allWorktrees.length > 0 && (
          <CommandMenuUI.Group heading="Sessions">
            {allWorktrees.map((wt) => {
              const isCurrentWorktree = selectedWorktree?.path === wt.path;
              const prStatus = prStatusByWorktreePath[wt.path];
              const statuses = getSessionSearchStatuses(
                processStatusByPath[wt.path] ?? "none",
                agentSidebarLifecycleEnabled ? agentRunByWorktreePath[wt.path] : undefined,
                prStatus,
              );
              return (
                <CommandMenuUI.Item
                  key={wt.path}
                  onSelect={() => handleSelectWorktree(wt)}
                  keywords={[
                    wt.repoName,
                    wt.branch ?? "",
                    wt.name,
                    prStatus?.title ?? "",
                    prStatus ? `PR ${prStatus.number}` : "",
                    ...statuses.map(({ label }) => label),
                    isCurrentWorktree ? "current active" : "",
                  ]}
                  className="min-h-16 text-primary"
                  aria-current={isCurrentWorktree ? "page" : undefined}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-hover text-tertiary">
                    <GitBranch className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{wt.branch || wt.name}</span>
                      {isCurrentWorktree ? (
                        <span className="shrink-0 text-[11px] text-secondary">
                          Current
                        </span>
                      ) : null}
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5 text-xs text-tertiary">
                      <span className="truncate">{wt.repoName}</span>
                      {prStatus ? <span className="shrink-0">PR #{prStatus.number}</span> : null}
                    </div>
                  </div>
                  <div className="ml-auto flex max-w-52 shrink-0 flex-col items-end gap-1">
                    {statuses.map((status) => (
                      <span
                        key={status.label}
                        className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-secondary"
                      >
                        <span
                          className={cn("h-1.5 w-1.5 rounded-full", statusDotClasses[status.tone])}
                          aria-hidden="true"
                        />
                        {status.label}
                      </span>
                    ))}
                  </div>
                </CommandMenuUI.Item>
              );
            })}
          </CommandMenuUI.Group>
        )}

        <CommandMenuUI.Group heading="Actions">
          <CommandMenuUI.Item onSelect={handleAddRepository} className="text-primary">
            <CommandMenuUI.ItemIcon as={FolderPlus} className="text-tertiary" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span>Add repository</span>
              <span className="text-xs text-tertiary">Open an existing Git repository</span>
            </span>
          </CommandMenuUI.Item>
          <CommandMenuUI.Item onSelect={handleNewWorkspace} className="text-primary">
            <CommandMenuUI.ItemIcon as={Plus} className="text-tertiary" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span>New workspace</span>
              <span className="text-xs text-tertiary">Create a session in the current Space</span>
            </span>
          </CommandMenuUI.Item>
        </CommandMenuUI.Group>

        <CommandMenuUI.Group heading="Navigation">
          {SHORTCUT_DEFINITIONS.filter(({ id }) => id !== "commandMenu").map((definition) => {
            const Icon = actionIcons[definition.id] ?? Keyboard;
            return (
              <CommandMenuUI.Item
                key={definition.id}
                onSelect={() => handleRunAction(definition.id)}
                keywords={[definition.description, "keyboard shortcut"]}
                className="text-primary"
              >
                <CommandMenuUI.ItemIcon as={Icon} className="text-tertiary" />
                <span className="min-w-0 flex-1 truncate">{definition.label}</span>
                <kbd className="shrink-0 rounded border border-subtle bg-hover px-1.5 py-0.5 font-sans text-[11px] text-tertiary">
                  {formatShortcut(keyboardShortcuts[definition.id])}
                </kbd>
              </CommandMenuUI.Item>
            );
          })}
        </CommandMenuUI.Group>

        <CommandMenuUI.Group heading="Theme">
          <CommandMenuUI.Item onSelect={handleToggleTheme} className="text-primary">
            <CommandMenuUI.ItemIcon
              as={themeMode === "dark" ? Sun : Moon}
              className="text-tertiary"
            />
            Switch to {themeMode === "dark" ? "light" : "dark"} mode
          </CommandMenuUI.Item>
        </CommandMenuUI.Group>
      </CommandMenuUI.List>

      <CommandMenuUI.Footer className="border-t border-subtle text-xs text-tertiary">
        <span>Sessions and commands</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <CommandMenuUI.FooterKeyBox>↑↓</CommandMenuUI.FooterKeyBox>
            Navigate
          </span>
          <span className="flex items-center gap-1.5">
            <CommandMenuUI.FooterKeyBox>↵</CommandMenuUI.FooterKeyBox>
            Open
          </span>
          <span className="flex items-center gap-1.5">
            <CommandMenuUI.FooterKeyBox>esc</CommandMenuUI.FooterKeyBox>
            Close
          </span>
        </div>
      </CommandMenuUI.Footer>
    </CommandMenuUI.Dialog>
  );
}
