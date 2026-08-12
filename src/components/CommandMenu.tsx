import * as React from "react";
import {
  AppWindow,
  FileText,
  Folder,
  FolderPlus,
  GitBranch,
  GitCompare,
  Keyboard,
  PanelLeft,
  PanelRight,
  PanelsTopLeft,
  Plus,
  Search,
  SlidersHorizontal,
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
  getSessionSearchFilters,
  getSessionSearchCommands,
  getSessionSearchStatuses,
  parseSessionSearch,
  SESSION_SEARCH_COMMANDS,
  type SessionSearchCommand,
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
  previousSpace: Folder,
  nextSpace: Folder,
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

const filterDotClasses: Record<SessionSearchCommand["filter"], string> = {
  attention: "bg-semantic-warning",
  waiting: "bg-semantic-warning",
  failed: "bg-semantic-error",
  ready: "bg-semantic-success",
  running: "bg-semantic-success",
  checks: "bg-semantic-warning",
};
const filterBySubstring = (value: string, search: string, keywords?: string[]) =>
  `${value} ${keywords?.join(" ") ?? ""}`.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;

export function CommandMenu({ open: isOpen, onOpenChange, onRunAction }: CommandMenuProps) {
  const themeMode = useThemeMode();
  const [search, setSearch] = React.useState("");
  const [activeFilter, setActiveFilter] = React.useState<SessionSearchCommand["filter"] | null>(null);
  const inputRef = React.useRef<React.ComponentRef<typeof CommandMenuUI.Input>>(null);

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

  const parsedSearch = React.useMemo(() => parseSessionSearch(search), [search]);
  const sessionEntries = React.useMemo(() => allWorktrees.map((worktree) => {
    const prStatus = prStatusByWorktreePath[worktree.path];
    const agentRun = agentSidebarLifecycleEnabled
      ? agentRunByWorktreePath[worktree.path]
      : undefined;
    const processStatus = processStatusByPath[worktree.path] ?? "none";
    const statuses = getSessionSearchStatuses(processStatus, agentRun, prStatus);
    const filters = getSessionSearchFilters(processStatus, agentRun, prStatus);
    const searchableText = [
      worktree.repoName,
      worktree.branch ?? "",
      worktree.name,
      worktree.path,
      prStatus?.title ?? "",
      prStatus ? `PR ${prStatus.number}` : "",
      ...statuses.map(({ label }) => label),
    ].join(" ").toLowerCase();

    return { worktree, prStatus, statuses, filters, searchableText };
  }), [
    agentRunByWorktreePath,
    agentSidebarLifecycleEnabled,
    allWorktrees,
    prStatusByWorktreePath,
    processStatusByPath,
  ]);
  const effectiveFilter = activeFilter;

  const filteredSessions = React.useMemo(() => {
    if (parsedSearch.commandQuery !== null) return [];
    if (!effectiveFilter) return sessionEntries;

    const query = parsedSearch.query.toLowerCase();
    return sessionEntries.filter(({ filters, searchableText }) => (
      filters.has(effectiveFilter) && (!query || searchableText.includes(query))
    ));
  }, [effectiveFilter, parsedSearch, sessionEntries]);
  const attentionSessions = filteredSessions.filter(({ filters }) => filters.has("attention"));
  const otherSessions = filteredSessions.filter(({ filters }) => !filters.has("attention"));
  const activeFilterLabel = SESSION_SEARCH_COMMANDS.find(
    ({ filter }) => filter === effectiveFilter,
  )?.label;
  const commandSuggestions = parsedSearch.commandQuery === null
    ? []
    : getSessionSearchCommands(parsedSearch.commandQuery);

  React.useEffect(() => {
    if (!isOpen) {
      setSearch("");
      setActiveFilter(null);
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

  const applyFilter = (filter: SessionSearchCommand["filter"]) => {
    setActiveFilter(filter);
    if (search.trimStart().startsWith("/")) setSearch("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleSearchChange = (value: string) => {
    const nextSearch = parseSessionSearch(value);
    if (nextSearch.filter) {
      setActiveFilter(nextSearch.filter);
      setSearch(nextSearch.query);
      return;
    }
    setSearch(value.trimStart());
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !search && activeFilter) {
      event.preventDefault();
      setActiveFilter(null);
      return;
    }
    if (event.key === "Escape" && (search || activeFilter)) {
      event.preventDefault();
      event.stopPropagation();
      setSearch("");
      setActiveFilter(null);
    }
  };

  const clearSearch = () => {
    setSearch("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const renderSession = ({ worktree: wt, prStatus, statuses, filters }: typeof sessionEntries[number]) => {
    const isCurrentWorktree = selectedWorktree?.path === wt.path;
    const visibleStatuses = statuses.filter(({ label }) => label !== "Idle" || statuses.length === 1);
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
          ...Array.from(filters, (filter) => `/${filter}`),
          isCurrentWorktree ? "current active" : "",
        ]}
        className="min-h-9 text-primary"
        aria-current={isCurrentWorktree ? "page" : undefined}
      >
        <GitBranch className="h-3.5 w-3.5 shrink-0 text-tertiary" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="truncate font-medium">{wt.branch || wt.name}</span>
          <span className="shrink-0 text-xs text-tertiary">{wt.repoName}</span>
          {prStatus ? <span className="shrink-0 text-xs text-tertiary">PR #{prStatus.number}</span> : null}
          {isCurrentWorktree ? <span className="shrink-0 text-[11px] text-secondary">Current</span> : null}
        </div>
        <div className="ml-auto flex max-w-48 shrink-0 items-center gap-2">
          {visibleStatuses.map((status) => (
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
  };

  return (
    <CommandMenuUI.Dialog
      open={isOpen}
      onOpenChange={onOpenChange}
      filter={filterBySubstring}
      shouldFilter={!effectiveFilter && parsedSearch.commandQuery === null}
    >
      <CommandMenuUI.DialogTitle className="sr-only">
        Search sessions and commands
      </CommandMenuUI.DialogTitle>
      <CommandMenuUI.DialogDescription className="sr-only">
        Switch sessions or run an application command.
      </CommandMenuUI.DialogDescription>

      <div className="group/cmd-input flex h-10 items-center gap-1.5 border-b border-subtle px-2">
        <Search className="h-4 w-4 shrink-0 text-tertiary" aria-hidden="true" />
        {activeFilter && activeFilterLabel ? (
          <button
            type="button"
            onClick={() => {
              setActiveFilter(null);
              inputRef.current?.focus();
            }}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded px-1 text-xs text-primary outline-none hover:bg-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1"
            aria-label={`Remove ${activeFilterLabel} filter`}
            title={`Remove ${activeFilterLabel} filter`}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", filterDotClasses[activeFilter])} aria-hidden="true" />
            {activeFilterLabel}
            <X className="h-3 w-3 text-muted" aria-hidden="true" />
          </button>
        ) : null}
        {activeFilter ? <span className="h-4 w-px shrink-0 bg-border-subtle" aria-hidden="true" /> : null}
        <CommandMenuUI.Input
          ref={inputRef}
          value={search}
          onValueChange={handleSearchChange}
          onKeyDown={handleSearchKeyDown}
          placeholder={activeFilterLabel
            ? `Search ${activeFilterLabel.toLowerCase()} worktrees…`
            : "Search worktrees and commands…"}
          aria-label="Search sessions and commands"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          className="h-full text-sm text-primary"
        />
        <div className="flex h-9 w-9 shrink-0 items-center justify-center">
          {search ? (
            <button
              type="button"
              onClick={clearSearch}
              className="flex h-9 w-9 items-center justify-center rounded-md text-tertiary hover:bg-hover hover:text-primary active:scale-[0.97]"
              aria-label="Clear search"
              title="Clear search"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <CommandMenuUI.List className="max-h-[min(400px,calc(100dvh-8rem))] overflow-y-auto bg-secondary [scroll-padding-block:0.25rem]">
        <CommandMenuUI.Empty>
          <Search className="mx-auto mb-3 h-5 w-5 text-muted" aria-hidden="true" />
          <p className="text-sm text-secondary">
            {search ? `No results for “${search}”` : "No sessions or commands"}
          </p>
          <p className="mt-1 text-xs text-tertiary">
            {effectiveFilter ? "Try another filter or remove the search text." : "Try a session, branch, repository, or /filter."}
          </p>
        </CommandMenuUI.Empty>
        {commandSuggestions.length > 0 ? (
          <CommandMenuUI.Group heading="Filters">
            {commandSuggestions.map((command) => (
              <CommandMenuUI.Item
                key={command.filter}
                value={`/${command.filter}`}
                onSelect={() => applyFilter(command.filter)}
                className="min-h-9 text-primary"
              >
                <CommandMenuUI.ItemIcon as={SlidersHorizontal} className="text-tertiary" />
                <span className="shrink-0">/{command.filter}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-tertiary">{command.description}</span>
              </CommandMenuUI.Item>
            ))}
          </CommandMenuUI.Group>
        ) : null}

        {effectiveFilter ? (
          filteredSessions.length > 0 ? (
            <CommandMenuUI.Group heading={activeFilterLabel}>
              {filteredSessions.map(renderSession)}
            </CommandMenuUI.Group>
          ) : null
        ) : (
          <>
            {attentionSessions.length > 0 ? (
              <CommandMenuUI.Group heading="Needs attention">
                {attentionSessions.map(renderSession)}
              </CommandMenuUI.Group>
            ) : null}
            {otherSessions.length > 0 ? (
              <CommandMenuUI.Group heading={attentionSessions.length > 0 ? "Other sessions" : "Sessions"}>
                {otherSessions.map(renderSession)}
              </CommandMenuUI.Group>
            ) : null}
          </>
        )}

        {parsedSearch.commandQuery === null && !effectiveFilter ? <CommandMenuUI.Group heading="Actions">
          <CommandMenuUI.Item onSelect={handleAddRepository} className="text-primary">
            <CommandMenuUI.ItemIcon as={FolderPlus} className="text-tertiary" />
            <span className="shrink-0">Add repository</span>
            <span className="min-w-0 flex-1 truncate text-xs text-tertiary">Open an existing Git repository</span>
          </CommandMenuUI.Item>
          <CommandMenuUI.Item onSelect={handleNewWorkspace} className="text-primary">
            <CommandMenuUI.ItemIcon as={Plus} className="text-tertiary" />
            <span className="shrink-0">New workspace</span>
            <span className="min-w-0 flex-1 truncate text-xs text-tertiary">Create a session in the current Space</span>
          </CommandMenuUI.Item>
        </CommandMenuUI.Group> : null}

        {parsedSearch.commandQuery === null && !effectiveFilter ? <CommandMenuUI.Group heading="Navigation">
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
        </CommandMenuUI.Group> : null}

        {parsedSearch.commandQuery === null && !effectiveFilter ? <CommandMenuUI.Group heading="Theme">
          <CommandMenuUI.Item onSelect={handleToggleTheme} className="text-primary">
            <CommandMenuUI.ItemIcon
              as={themeMode === "dark" ? Sun : Moon}
              className="text-tertiary"
            />
            Switch to {themeMode === "dark" ? "light" : "dark"} mode
          </CommandMenuUI.Item>
        </CommandMenuUI.Group> : null}
      </CommandMenuUI.List>

      <CommandMenuUI.Footer className="border-t border-subtle text-xs text-tertiary">
        <span className="flex items-center gap-1">
          <CommandMenuUI.FooterKeyBox>{activeFilter ? "⌫" : "/"}</CommandMenuUI.FooterKeyBox>
          {activeFilter ? "Clear" : "Filters"}
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <CommandMenuUI.FooterKeyBox>↑↓</CommandMenuUI.FooterKeyBox>
          </span>
          <span className="flex items-center gap-1">
            <CommandMenuUI.FooterKeyBox>↵</CommandMenuUI.FooterKeyBox>
          </span>
          <span className="flex items-center gap-1">
            <CommandMenuUI.FooterKeyBox>esc</CommandMenuUI.FooterKeyBox>
          </span>
        </div>
      </CommandMenuUI.Footer>
    </CommandMenuUI.Dialog>
  );
}
