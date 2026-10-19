import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  X,
  Check,
  AlertCircle,
  User,
  Palette,
  SlidersHorizontal,
  BookOpen,
  Bot,
  Server,
  Bug,
  ChevronDown,
  FolderOpen,
  Keyboard,
  RefreshCw,
  Moon,
  Sun,
  Search,
  RotateCcw,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useAppStore } from "../store";
import { cn } from "../utils/cn";
import { Tooltip } from "./ui/tooltip";
import { AI_AGENTS, type AIAgent, type Repository } from "../types";
import { useThemeMode } from "../hooks/useTheme";
import { ShortcutKeys } from "./KeyboardShortcutsHelp";
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  SHORTCUT_DEFINITIONS,
  SHORTCUT_GROUPS,
  formatShortcut,
  getShortcutConflict,
  shortcutFromKeyboardEvent,
  type ShortcutAction,
} from "../lib/keyboard-shortcuts";

interface SettingsPanelProps {
  onClose: () => void;
}

interface TerminalDiagnostic {
  terminalId: string;
  worktreePath: string;
  shellPid: number | null;
  foregroundPid: number | null;
  foregroundProcess: string | null;
  queuedInputBytes: number | null;
  writeBlockedMs: number | null;
  recoverable: boolean;
}

interface TerminalRecoveryResult {
  terminalId: string;
  terminatedPid: number;
  terminatedProcess: string;
  drainedInputBytes: number;
}

interface SettingsResource {
  kind: "skill" | "agent" | "mcp";
  name: string;
  path: string;
  scope: string;
}

type NavSection =
  | "account"
  | "appearance"
  | "preferences"
  | "shortcuts"
  | "projects"
  | "skills"
  | "agents"
  | "mcp"
  | "debug";

interface NavItem {
  readonly id: NavSection;
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly group: "General" | "Workspace" | "System";
  readonly beta?: boolean;
}

const AUTO_FETCH_INTERVAL_OPTIONS = [5, 10, 15, 30, 60] as const;

function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 pb-1">
      <div className="space-y-1">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-tertiary">
          {title}
        </h4>
        {description ? (
          <p className="max-w-[56ch] text-xs leading-5 text-tertiary">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

function SettingsGroup({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <SectionHeading title={title} description={description} action={action} />
      <SettingsCard>{children}</SettingsCard>
    </section>
  );
}

function SettingsCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("divide-y divide-border-subtle", className)}>
      {children}
    </div>
  );
}

function SettingsRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-12 items-center justify-between gap-6 py-2.5",
        className
      )}
    >
      {children}
    </div>
  );
}

function SettingsLabel({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="text-[13px] text-primary">{title}</div>
      {description ? (
        <p className="max-w-[52ch] text-xs leading-4 text-tertiary">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function SettingsSwitch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary",
        checked ? "bg-accent-primary" : "bg-active ring-1 ring-inset ring-border"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150 ease-out motion-reduce:transition-none",
          checked && "translate-x-4"
        )}
      />
    </button>
  );
}

function SettingsSelect<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled = false,
}: {
  value: T;
  options: readonly { value: T; label: string; detail?: string }[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
}) {
  const selected = options.find((option) => option.value === value) ?? options[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={`${label}: ${selected.label}`}
        className="flex h-8 w-44 shrink-0 items-center justify-between gap-2 rounded-md border border-border bg-secondary px-2.5 text-[13px] text-primary transition-colors hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-secondary data-[state=open]:bg-hover"
      >
        <span className="truncate">{selected.label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-tertiary" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuRadioGroup
          value={String(value)}
          onValueChange={(next) => {
            const option = options.find((candidate) => String(candidate.value) === next);
            if (option) onChange(option.value);
          }}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={String(option.value)} className="text-[13px]">
              <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <span className="truncate">{option.label}</span>
                {option.detail ? (
                  <span className="font-mono text-[11px] opacity-60">{option.detail}</span>
                ) : null}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const {
    githubSettings,
    defaultAIAgent,
    setDefaultAIAgent,
    repositories,
    autoFetchSettings,
    setAutoFetchEnabled,
    setAutoFetchIntervalMinutes,
    notificationsEnabled,
    setNotificationsEnabled,
    repoPostCreateCommandsByPath,
    setRepoPostCreateCommands,
  } = useAppStore();
  const [activeSection, setActiveSection] = useState<NavSection>("account");

  const navItems: readonly NavItem[] = [
    { id: "account", label: "Account", icon: <User className="w-3.5 h-3.5" />, group: "General" },
    { id: "appearance", label: "Appearance", icon: <Palette className="w-3.5 h-3.5" />, group: "General" },
    { id: "preferences", label: "Preferences", icon: <SlidersHorizontal className="w-3.5 h-3.5" />, group: "General" },
    { id: "shortcuts", label: "Keyboard Shortcuts", icon: <Keyboard className="w-3.5 h-3.5" />, group: "General" },
    { id: "projects", label: "Projects", icon: <FolderOpen className="w-3.5 h-3.5" />, group: "Workspace" },
    { id: "skills", label: "Skills", icon: <BookOpen className="w-3.5 h-3.5" />, group: "Workspace", beta: true },
    { id: "agents", label: "Custom Agents", icon: <Bot className="w-3.5 h-3.5" />, group: "Workspace", beta: true },
    { id: "mcp", label: "MCP Servers", icon: <Server className="w-3.5 h-3.5" />, group: "Workspace" },
    { id: "debug", label: "Debug", icon: <Bug className="w-3.5 h-3.5" />, group: "System" },
  ];

  const sectionTitles: Record<NavSection, string> = {
    account: "Account",
    appearance: "Appearance",
    preferences: "Preferences",
    shortcuts: "Keyboard Shortcuts",
    projects: "Projects",
    skills: "Skills",
    agents: "Custom Agents",
    mcp: "MCP Servers",
    debug: "Debug",
  };
  const sectionDescriptions: Record<NavSection, string> = {
    account: "Your connected GitHub identity.",
    appearance: "Choose how Autopilot looks.",
    preferences: "Defaults for agents and repository sync.",
    shortcuts: "Customize commands used across the app.",
    projects: "Configure connected repositories.",
    skills: "Skills available to your agents.",
    agents: "Agent definitions from your configuration.",
    mcp: "Connected Model Context Protocol servers.",
    debug: "Diagnostics and local integrations.",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div
        className="app-panel flex h-[560px] w-full max-w-[900px] overflow-hidden rounded-xl border border-border bg-secondary shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex w-[220px] flex-shrink-0 flex-col bg-tertiary">
          <div className="px-4 py-3.5">
            <h2 className="text-sm font-semibold text-primary">Settings</h2>
          </div>

          <nav className="flex-1 overflow-y-auto px-2 pb-3">
            <ul className="space-y-0.5">
              {navItems.map((item, index) => {
                const isActive = activeSection === item.id;
                return (
                  <li key={item.id}>
                    {index === 0 || navItems[index - 1].group !== item.group ? (
                      <div className={cn("px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted", index === 0 && "pt-1")}>
                        {item.group}
                      </div>
                    ) : null}
                    <button
                      onClick={() => setActiveSection(item.id)}
                      className={cn(
                        "flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-primary",
                        isActive ? "bg-active text-primary" : "text-secondary hover:bg-hover hover:text-primary"
                      )}
                    >
                      <span className={isActive ? "text-primary" : "text-tertiary"}>
                        {item.icon}
                      </span>
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.beta ? (
                        <span className="text-[10px] font-medium text-muted">Beta</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <button
            type="button"
            onClick={() => setActiveSection("account")}
            className="m-2 flex items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary"
          >
            {githubSettings.ghAuthUser ? (
              <img
                src={`https://github.com/${githubSettings.ghAuthUser}.png?size=64`}
                alt=""
                className="h-8 w-8 rounded-md"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-active text-tertiary">
                <User className="h-3.5 w-3.5" />
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-primary">
                {githubSettings.ghAuthUser ?? "GitHub account"}
              </div>
              <div className="text-[11px] text-tertiary">Manage account</div>
            </div>
          </button>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[61px] items-center justify-between px-6">
            <div>
              <h3 className="text-sm font-semibold text-primary">
                {sectionTitles[activeSection]}
              </h3>
              <p className="mt-0.5 text-xs text-tertiary">{sectionDescriptions[activeSection]}</p>
            </div>
            <Tooltip content="Dismiss settings panel">
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-hover hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary"
                aria-label="Close settings"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {activeSection === "account" ? (
              <AccountSection githubSettings={githubSettings} repositories={repositories} />
            ) : null}
            {activeSection === "appearance" ? (
              <AppearanceSection />
            ) : null}
            {activeSection === "preferences" ? (
              <PreferencesSection
                defaultAIAgent={defaultAIAgent}
                setDefaultAIAgent={setDefaultAIAgent}
                autoFetchEnabled={autoFetchSettings.enabled}
                autoFetchIntervalMinutes={autoFetchSettings.intervalMinutes}
                setAutoFetchEnabled={setAutoFetchEnabled}
                setAutoFetchIntervalMinutes={setAutoFetchIntervalMinutes}
                notificationsEnabled={notificationsEnabled}
                setNotificationsEnabled={setNotificationsEnabled}
              />
            ) : null}
            {activeSection === "shortcuts" ? <KeyboardShortcutsSection /> : null}
            {activeSection === "projects" ? (
              <ProjectsSection
                repositories={repositories}
                repoPostCreateCommandsByPath={repoPostCreateCommandsByPath}
                setRepoPostCreateCommands={setRepoPostCreateCommands}
              />
            ) : null}
            {activeSection === "skills" ? (
              <ResourcesSection kind="skill" repositories={repositories} />
            ) : null}
            {activeSection === "agents" ? (
              <ResourcesSection kind="agent" repositories={repositories} />
            ) : null}
            {activeSection === "mcp" ? (
              <ResourcesSection kind="mcp" repositories={repositories} />
            ) : null}
            {activeSection === "debug" ? (
              <DebugSection githubSettings={githubSettings} />
            ) : null}
          </div>

        </div>
      </div>
    </div>
  );
}

function AppearanceSection() {
  const themeMode = useThemeMode();
  const setThemeMode = useAppStore((state) => state.setThemeMode);

  return (
    <div className="grid grid-cols-2 gap-2">
      {([
        { id: "dark", label: "Dark", icon: Moon, preview: "bg-[#0d0e0f]" },
        { id: "light", label: "Light", icon: Sun, preview: "bg-[#f0efed]" },
      ] as const).map((option) => {
        const Icon = option.icon;
        const selected = themeMode === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => void setThemeMode(option.id)}
            aria-pressed={selected}
            className={cn(
              "rounded-lg border p-1.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary",
              selected ? "border-border-strong bg-active" : "border-border-subtle bg-primary hover:bg-hover",
            )}
          >
            <div className={cn("h-20 overflow-hidden rounded-md p-2", option.preview)}>
              <div className="flex h-full gap-1.5 rounded bg-black/10 p-1.5 ring-1 ring-black/10">
                <div className="w-1/3 rounded bg-white/10" />
                <div className="flex-1 space-y-1.5 rounded bg-white/10 p-1.5">
                  <div className="h-2 w-2/3 rounded-full bg-white/40" />
                  <div className="h-5 rounded bg-white/10" />
                  <div className="h-5 rounded bg-white/10" />
                </div>
              </div>
            </div>
            <div className="flex h-9 items-center gap-2 px-1.5">
              <Icon className="h-4 w-4 text-secondary" />
              <span className="text-sm font-medium text-primary">{option.label}</span>
              {selected ? <Check className="ml-auto h-4 w-4 text-accent-primary" /> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ResourcesSection({
  kind,
  repositories,
}: {
  kind: SettingsResource["kind"];
  repositories: readonly Repository[];
}) {
  const [resources, setResources] = useState<SettingsResource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const discovered = await invoke<SettingsResource[]>("discover_settings_resources", {
        repoPaths: repositories.map((repository) => repository.info.path),
      });
      setResources(discovered);
      setError(null);
    } catch (resourceError) {
      setError(String(resourceError));
    } finally {
      setIsLoading(false);
    }
  }, [repositories]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const copy = {
    skill: {
      label: "skills",
      empty: "No skills found",
      icon: BookOpen,
    },
    agent: {
      label: "agents",
      empty: "No custom agents found",
      icon: Bot,
    },
    mcp: {
      label: "servers",
      empty: "No MCP servers found",
      icon: Server,
    },
  }[kind];
  const ResourceIcon = copy.icon;
  const filtered = resources.filter(
    (resource) =>
      resource.kind === kind &&
      `${resource.name} ${resource.scope} ${resource.path}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Filter {copy.label}</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tertiary" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Filter ${copy.label}…`}
            spellCheck={false}
            autoComplete="off"
            className="h-8 w-full rounded-md border border-border bg-secondary pl-8 pr-3 text-[13px] text-primary outline-none placeholder:text-tertiary focus:ring-2 focus:ring-accent-primary"
          />
        </label>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={isLoading}
          aria-label={`Refresh ${copy.label}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-secondary hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-60"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin motion-reduce:animate-none")} />
        </button>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-semantic-error/10 px-3 py-2 text-[13px] text-semantic-error">
          Could not scan settings: {error}
        </p>
      ) : null}

      <div role="status" className="sr-only">
        {isLoading
          ? "Scanning configuration…"
          : error
            ? ""
            : filtered.length === 0
              ? query ? "No matching results" : copy.empty
              : `${filtered.length} result${filtered.length === 1 ? "" : "s"} found`}
      </div>
      <SettingsCard className="border-t border-border-subtle">
        {isLoading && resources.length === 0 ? (
          <SettingsRow><SettingsLabel title="Scanning configuration…" /></SettingsRow>
        ) : null}
        {!isLoading && filtered.length === 0 ? (
          <SettingsRow>
            <SettingsLabel
              title={query ? "No matching results" : copy.empty}
              description={query ? "Try a name, repository, or path." : "Add a definition under .agents, .codex, or .claude to see it here."}
            />
          </SettingsRow>
        ) : null}
        {filtered.map((resource) => (
          <SettingsRow key={`${resource.kind}:${resource.path}:${resource.name}`}>
            <div className="flex min-w-0 items-center gap-3">
              <ResourceIcon className="h-3.5 w-3.5 shrink-0 text-tertiary" />
              <div className="min-w-0">
                <div className="truncate text-[13px] text-primary">{resource.name}</div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-tertiary" title={resource.path}>
                  {resource.path}
                </div>
              </div>
            </div>
            <span className="shrink-0 text-xs text-tertiary">
              {resource.scope}
            </span>
          </SettingsRow>
        ))}
      </SettingsCard>
    </div>
  );
}

function KeyboardShortcutsSection() {
  const keyboardShortcuts = useAppStore((state) => state.keyboardShortcuts);
  const setKeyboardShortcut = useAppStore((state) => state.setKeyboardShortcut);
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const definitions = new Map(
    SHORTCUT_DEFINITIONS.map((definition) => [definition.id, definition]),
  );

  const saveShortcut = (action: ShortcutAction, shortcut: string) => {
    const conflict = getShortcutConflict(action, shortcut, keyboardShortcuts);
    if (conflict) {
      setError(`${formatShortcut(shortcut)} is already assigned to ${conflict.label}.`);
      return;
    }

    void setKeyboardShortcut(action, shortcut);
    setRecording(null);
    setError(null);
  };

  const recordShortcut = (
    action: ShortcutAction,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setRecording(null);
      setError(null);
      return;
    }

    const shortcut = shortcutFromKeyboardEvent(event.nativeEvent);
    if (!shortcut) {
      setError("Use at least one modifier key (Command, Control, or Option). Press Escape to cancel.");
      return;
    }

    saveShortcut(action, shortcut);
  };

  return (
    <div className="space-y-6">
      <p className="text-xs leading-5 text-tertiary">
        Click a shortcut, then press the new keys. Faded keys are fixed arrow-key alternatives.
      </p>
      {error ? (
        <p role="alert" className="rounded-lg bg-semantic-error/10 px-3 py-2 text-xs text-semantic-error">
          {error}
        </p>
      ) : null}

      {SHORTCUT_GROUPS.map((group) => (
        <section key={group.title} aria-label={group.title} className="space-y-2">
          <SectionHeading title={group.title} />
          <SettingsCard className="rounded-lg border border-border-subtle bg-tertiary">
            {group.actions.map((action) => {
              const definition = definitions.get(action);
              if (!definition) return null;
              const shortcut = keyboardShortcuts[action];
              const isRecording = recording === action;
              const isDefault = shortcut === DEFAULT_KEYBOARD_SHORTCUTS[action];
              return (
                <SettingsRow key={action} className="min-h-11 gap-4 px-4 py-1.5">
                  <span className="truncate text-[13px] text-primary" title={definition.description}>
                    {definition.label}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    {definition.alternateShortcuts?.map((binding) => (
                      <ShortcutKeys key={binding} shortcut={binding} muted />
                    ))}
                    {!isDefault ? (
                      <Tooltip content="Reset to default">
                        <button
                          type="button"
                          onClick={() => saveShortcut(action, DEFAULT_KEYBOARD_SHORTCUTS[action])}
                          aria-label={`Reset ${definition.label} shortcut`}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-hover hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      </Tooltip>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setRecording(action);
                        setError(null);
                      }}
                      onBlur={() => setRecording((current) => current === action ? null : current)}
                      onKeyDown={(event) => recordShortcut(action, event)}
                      aria-label={`Change ${definition.label} shortcut, currently ${formatShortcut(shortcut)}`}
                      className={cn(
                        "flex h-8 min-w-[88px] items-center justify-end rounded-md px-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary",
                        isRecording
                          ? "justify-center bg-active text-xs text-primary ring-1 ring-accent-primary"
                          : "hover:bg-hover",
                      )}
                    >
                      {isRecording ? "Press keys…" : <ShortcutKeys shortcut={shortcut} />}
                    </button>
                  </div>
                </SettingsRow>
              );
            })}
          </SettingsCard>
        </section>
      ))}
    </div>
  );
}

function AccountSection({
  githubSettings,
  repositories,
}: {
  githubSettings: { ghCliAvailable: boolean; ghAuthUser: string | null };
  repositories: readonly Repository[];
}) {
  const user = githubSettings.ghCliAvailable ? githubSettings.ghAuthUser : null;

  return (
    <div className="space-y-6">
    <SettingsGroup title="GitHub">
      {user ? (
        <SettingsRow>
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={`https://github.com/${user}.png?size=128`}
              alt=""
              className="h-8 w-8 rounded-full"
            />
            <div className="min-w-0">
              <div className="truncate text-[13px] text-primary">@{user}</div>
              <div className="flex items-center gap-1 text-xs text-tertiary">
                <Check className="h-3 w-3 text-semantic-success" />
                Signed in with GitHub CLI
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void openUrl(`https://github.com/${user}`)}
            className="h-8 shrink-0 rounded-md border border-border bg-secondary px-2.5 text-xs text-secondary transition-colors hover:bg-hover hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary"
          >
            View profile
          </button>
        </SettingsRow>
      ) : (
        <SettingsRow className="items-start">
          <div className="flex min-w-0 items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-semantic-error" />
            <SettingsLabel
              title={githubSettings.ghCliAvailable ? "GitHub CLI is not signed in" : "GitHub CLI is not installed"}
              description={
                githubSettings.ghCliAvailable
                  ? "Run `gh auth login` to finish setup."
                  : "Run `brew install gh`, then `gh auth login`."
              }
            />
          </div>
          {!githubSettings.ghCliAvailable ? (
            <button
              type="button"
              onClick={() => void openUrl("https://cli.github.com")}
              className="h-8 shrink-0 rounded-md border border-border bg-secondary px-2.5 text-xs text-secondary transition-colors hover:bg-hover hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary"
            >
              GitHub CLI docs
            </button>
          ) : null}
        </SettingsRow>
      )}
    </SettingsGroup>
    {user ? <GithubAccountsGroup repositories={repositories} /> : null}
    </div>
  );
}

interface GithubAccountsConfig {
  default: string | null;
  owners: Record<string, string>;
  identities: Record<string, { name: string; email: string }>;
}

const NO_ACCOUNT = "";
const inputClass =
  "h-8 min-w-0 flex-1 rounded-md border border-border bg-secondary px-2.5 text-[13px] text-primary outline-none placeholder:text-tertiary focus:ring-2 focus:ring-accent-primary";

function GithubAccountsGroup({ repositories }: { repositories: readonly Repository[] }) {
  const [accounts, setAccounts] = useState<string[]>([]);
  const [config, setConfig] = useState<GithubAccountsConfig | null>(null);
  const [owners, setOwners] = useState<(string | null)[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      invoke<string[]>("list_gh_accounts"),
      invoke<GithubAccountsConfig>("get_github_accounts"),
    ])
      .then(([logins, saved]) => {
        setAccounts(logins);
        setConfig(saved);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    void invoke<(string | null)[]>("get_repo_owners", {
      repoPaths: repositories.map((repository) => repository.info.path),
    })
      .then(setOwners)
      .catch((e) => setError(String(e)));
  }, [repositories]);

  if (error) return <p className="text-xs text-semantic-error">{error}</p>;
  if (!config || accounts.length === 0) return null;

  const save = (next: GithubAccountsConfig) => {
    setConfig(next);
    invoke("set_github_accounts", { config: next }).catch((e) => setError(String(e)));
  };
  const accountOptions = accounts.map((login) => ({ value: login, label: `@${login}` }));
  const setOwnerAccount = (owner: string, account: string) => {
    const next = { ...config.owners };
    if (account) next[owner] = account;
    else delete next[owner];
    save({ ...config, owners: next });
  };
  const setIdentity = (login: string, name: string, email: string) => {
    const identities = { ...config.identities };
    if (name && email) identities[login] = { name, email };
    else delete identities[login];
    save({ ...config, identities });
  };
  const defaultOption = {
    value: NO_ACCOUNT,
    label: config.default ? `@${config.default}` : "gh active account",
    detail: "default",
  };

  return (
    <SettingsGroup
      title="Project accounts"
      description="Choose which account gh uses for each project. A choice applies to every project from the same owner."
    >
      <SettingsRow>
        <SettingsLabel title="Default account" description="Used by projects without their own account." />
        <SettingsSelect
          label="Default account"
          value={config.default ?? NO_ACCOUNT}
          options={[{ value: NO_ACCOUNT, label: "gh active account" }, ...accountOptions]}
          onChange={(value) => save({ ...config, default: value || null })}
        />
      </SettingsRow>
      {repositories.map((repository, index) => {
        const owner = owners[index];
        return (
          <SettingsRow key={repository.info.path}>
            <div className="flex min-w-0 items-center gap-3">
              {owner ? (
                <img
                  src={`https://github.com/${owner}.png?size=48`}
                  alt=""
                  className="h-6 w-6 shrink-0 rounded-full bg-secondary"
                />
              ) : (
                <div aria-hidden="true" className="h-6 w-6 shrink-0 rounded-full bg-secondary" />
              )}
              <SettingsLabel
                title={repository.info.name}
                description={owner ?? "No GitHub remote"}
              />
            </div>
            <SettingsSelect
              label={`Account for ${repository.info.name}`}
              disabled={!owner}
              value={(owner && config.owners[owner]) || NO_ACCOUNT}
              options={[defaultOption, ...accountOptions]}
              onChange={(value) => owner && setOwnerAccount(owner, value)}
            />
          </SettingsRow>
        );
      })}
      <details className="group py-2.5">
        <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md text-xs text-secondary transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary [&::-webkit-details-marker]:hidden">
          <ChevronDown className="h-3.5 w-3.5 -rotate-90 transition-transform duration-150 ease-out group-open:rotate-0 motion-reduce:transition-none" />
          Commit author in terminals (optional)
        </summary>
        <div className="space-y-2 pt-1">
          {accounts.map((login) => (
            <div
              key={login}
              className="flex items-center gap-2"
              onChange={(event) => {
                const [name, email] = event.currentTarget.querySelectorAll("input");
                setIdentity(login, name.value.trim(), email.value.trim());
              }}
            >
              <span className="w-36 shrink-0 truncate text-[13px] text-primary">@{login}</span>
              <input
                defaultValue={config.identities[login]?.name ?? ""}
                aria-label={`Git name for ${login}`}
                placeholder="Name"
                autoComplete="off"
                className={inputClass}
              />
              <input
                defaultValue={config.identities[login]?.email ?? ""}
                aria-label={`Git email for ${login}`}
                placeholder="Email"
                autoComplete="off"
                className={inputClass}
              />
            </div>
          ))}
          <p className="text-xs text-tertiary">
            Needs both fields. Terminals get a project's GH_TOKEN only when the project has its own account, not the default.
          </p>
        </div>
      </details>
    </SettingsGroup>
  );
}

function DebugSection({
  githubSettings,
}: {
  githubSettings: { ghCliAvailable: boolean; ghAuthUser: string | null };
}) {
  const [terminals, setTerminals] = useState<TerminalDiagnostic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [recoveringId, setRecoveringId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refreshDiagnostics = useCallback(async () => {
    try {
      const diagnostics = await invoke<TerminalDiagnostic[]>(
        "get_terminal_diagnostics",
      );
      setTerminals(
        diagnostics.sort((left, right) => {
          const leftBlocked = left.writeBlockedMs ?? 0;
          const rightBlocked = right.writeBlockedMs ?? 0;
          return rightBlocked - leftBlocked || left.worktreePath.localeCompare(right.worktreePath);
        }),
      );
      setError(null);
    } catch (diagnosticError) {
      setError(String(diagnosticError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDiagnostics();
    const interval = window.setInterval(() => {
      void refreshDiagnostics();
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [refreshDiagnostics]);

  const recoverTerminal = async (terminal: TerminalDiagnostic) => {
    if (terminal.foregroundPid == null) return;
    setRecoveringId(terminal.terminalId);
    setError(null);
    setMessage(null);
    try {
      const result = await invoke<TerminalRecoveryResult>(
        "recover_terminal_process",
        {
          terminalId: terminal.terminalId,
          expectedForegroundPid: terminal.foregroundPid,
        },
      );
      setMessage(
        `Ended ${result.terminatedProcess} (PID ${result.terminatedPid}) and kept its terminal open.`,
      );
      setConfirmingId(null);
      await refreshDiagnostics();
    } catch (recoveryError) {
      setError(String(recoveryError));
    } finally {
      setRecoveringId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <SectionHeading
          title="Terminal recovery"
          description="Recovery ends only the foreground process and keeps its terminal shell open."
          action={
          <Tooltip content="Refresh diagnostics">
            <button
              type="button"
              onClick={() => void refreshDiagnostics()}
              disabled={isLoading}
              aria-label="Refresh terminal diagnostics"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-secondary hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-60"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin motion-reduce:animate-none")} />
            </button>
          </Tooltip>
          }
        />

        {error ? (
          <p role="alert" className="rounded-lg bg-semantic-error/10 px-3 py-2 text-xs leading-5 text-semantic-error">
            {error}
          </p>
        ) : null}
        {message ? (
          <p role="status" className="rounded-lg bg-active px-3 py-2 text-xs leading-5 text-secondary">
            {message}
          </p>
        ) : null}

        <SettingsCard>
          {isLoading && terminals.length === 0 ? (
            <SettingsRow>
              <SettingsLabel
                title="Inspecting terminal sessions…"
                description="Reading foreground processes and queued input."
              />
            </SettingsRow>
          ) : null}
          {!isLoading && terminals.length === 0 ? (
            <SettingsRow>
              <SettingsLabel
                title="No terminal sessions"
                description="Open a worktree terminal and it will appear here."
              />
            </SettingsRow>
          ) : null}
          {terminals.map((terminal) => {
            const blocked =
              (terminal.writeBlockedMs ?? 0) >= 500 ||
              (terminal.queuedInputBytes ?? 0) >= 1_000;
            const worktreeName =
              terminal.worktreePath.split(/[\\/]/).filter(Boolean).pop() ??
              "Unknown worktree";
            const isRecovering = recoveringId === terminal.terminalId;
            const isConfirming = confirmingId === terminal.terminalId;

            return (
              <SettingsRow key={terminal.terminalId}>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] text-primary">
                      {worktreeName}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums",
                        blocked
                          ? "bg-semantic-error/10 text-semantic-error"
                          : "bg-active text-secondary",
                      )}
                    >
                      {blocked ? "Input blocked" : "Responsive"}
                    </span>
                  </div>
                  <p className="truncate font-mono text-[11px] text-tertiary" title={terminal.worktreePath}>
                    {terminal.worktreePath}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] tabular-nums text-secondary">
                    <span>
                      {terminal.foregroundProcess ?? "Shell"} PID {terminal.foregroundPid ?? terminal.shellPid ?? "—"}
                    </span>
                    {terminal.queuedInputBytes != null ? (
                      <span>{terminal.queuedInputBytes.toLocaleString()} queued bytes</span>
                    ) : null}
                    {terminal.writeBlockedMs != null && terminal.writeBlockedMs >= 500 ? (
                      <span>{Math.max(1, Math.round(terminal.writeBlockedMs / 1_000))}s blocked</span>
                    ) : null}
                  </div>
                </div>

                {terminal.recoverable ? (
                  <div className="flex shrink-0 items-center gap-2">
                    {isConfirming ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          disabled={isRecovering}
                          className="h-8 rounded-md px-2.5 text-xs text-secondary hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-60"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          autoFocus
                          onClick={() => void recoverTerminal(terminal)}
                          disabled={isRecovering}
                          className="h-8 rounded-md bg-semantic-error px-2.5 text-xs font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-semantic-error disabled:opacity-60"
                        >
                          {isRecovering ? "Recovering…" : "End process"}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmingId(terminal.terminalId);
                          setMessage(null);
                        }}
                        aria-label={`Recover terminal for ${worktreeName}`}
                        className="h-8 rounded-md border border-border bg-secondary px-2.5 text-xs font-medium text-secondary hover:bg-hover hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary"
                      >
                        Recover
                      </button>
                    )}
                  </div>
                ) : null}
              </SettingsRow>
            );
          })}
        </SettingsCard>
      </div>

      <SettingsGroup title="GitHub integration">
        <SettingsRow>
          <SettingsLabel
            title="GitHub CLI"
            description={
              githubSettings.ghCliAvailable
                ? githubSettings.ghAuthUser
                  ? `Authenticated as @${githubSettings.ghAuthUser}`
                  : "Installed, but not authenticated. Run `gh auth login`."
                : "Not installed. Run `brew install gh` to enable GitHub-backed actions."
            }
          />
          {githubSettings.ghCliAvailable ? (
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-secondary">
              <Check className="h-3.5 w-3.5 text-semantic-success" />
              Available
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-semantic-error">
              <AlertCircle className="h-3.5 w-3.5" />
              Missing
            </span>
          )}
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}

function PreferencesSection({
  defaultAIAgent,
  setDefaultAIAgent,
  autoFetchEnabled,
  autoFetchIntervalMinutes,
  setAutoFetchEnabled,
  setAutoFetchIntervalMinutes,
  notificationsEnabled,
  setNotificationsEnabled,
}: {
  defaultAIAgent: AIAgent;
  setDefaultAIAgent: (agent: AIAgent) => Promise<void>;
  autoFetchEnabled: boolean;
  autoFetchIntervalMinutes: number;
  setAutoFetchEnabled: (enabled: boolean) => Promise<void>;
  setAutoFetchIntervalMinutes: (intervalMinutes: number) => Promise<void>;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
}) {
  return (
    <div className="space-y-8">
      <SettingsGroup title="Agents">
        <SettingsRow>
          <SettingsLabel title="Default agent" description="Writes commit messages in the Git panel." />
          <SettingsSelect
            label="Default agent"
            value={defaultAIAgent}
            options={AI_AGENTS.map((agent) => ({ value: agent.id, label: agent.name, detail: agent.command }))}
            onChange={(agent) => void setDefaultAIAgent(agent)}
          />
        </SettingsRow>
        <SettingsRow>
          <SettingsLabel title="Notifications" description="Play a sound and notify when an agent finishes, errors, or needs input while the app is in the background." />
          <SettingsSwitch
            label="Notifications"
            checked={notificationsEnabled}
            onCheckedChange={(checked) => void setNotificationsEnabled(checked)}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Repository sync">
        <SettingsRow>
          <SettingsLabel title="Auto-fetch remotes" description="Keep remote branches current in the background." />
          <SettingsSwitch
            label="Auto-fetch remotes"
            checked={autoFetchEnabled}
            onCheckedChange={(checked) => void setAutoFetchEnabled(checked)}
          />
        </SettingsRow>
        <SettingsRow className={cn(!autoFetchEnabled && "opacity-60")}>
          <SettingsLabel title="Fetch interval" />
          <SettingsSelect
            label="Fetch interval"
            value={autoFetchIntervalMinutes}
            disabled={!autoFetchEnabled}
            options={AUTO_FETCH_INTERVAL_OPTIONS.map((minutes) => ({ value: minutes, label: `Every ${minutes} minutes` }))}
            onChange={(minutes) => void setAutoFetchIntervalMinutes(minutes)}
          />
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}

function ProjectsSection({
  repositories,
  repoPostCreateCommandsByPath,
  setRepoPostCreateCommands,
}: {
  repositories: readonly Repository[];
  repoPostCreateCommandsByPath: Record<string, string>;
  setRepoPostCreateCommands: (repoPath: string, commands: string) => Promise<void>;
}) {
  const [expandedPath, setExpandedPath] = useState<string | null>(null);

  if (repositories.length === 0) {
    return (
      <PlaceholderSection
        title="No projects yet"
        description="Add a repository first, then configure the commands that should run after each new workspace is created."
      />
    );
  }

  return (
    <SettingsGroup
      title="Post-create commands"
      description="Shell commands that run inside every new worktree of a project."
    >
      {repositories.map((repository) => {
        const path = repository.info.path;
        const commands = repoPostCreateCommandsByPath[path] ?? "";
        const lineCount = commands.split("\n").filter((line) => line.trim()).length;
        const isExpanded = expandedPath === path;
        const fieldId = `post-create-${path}`;

        return (
          <div key={path}>
            <button
              type="button"
              onClick={() => setExpandedPath(isExpanded ? null : path)}
              aria-expanded={isExpanded}
              aria-controls={fieldId}
              className="group flex min-h-12 w-full items-center justify-between gap-6 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary"
            >
              <div className="min-w-0">
                <div className="text-[13px] text-primary">{repository.info.name}</div>
                <div className="truncate font-mono text-[11px] text-tertiary" title={path}>
                  {path}
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-tertiary group-hover:text-primary">
                {lineCount > 0 ? `${lineCount} line${lineCount === 1 ? "" : "s"}` : "None"}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-150", isExpanded && "rotate-180")} />
              </span>
            </button>
            {isExpanded ? (
              <div className="space-y-2 pb-3">
                <label htmlFor={fieldId} className="sr-only">
                  Post-create commands for {repository.info.name}
                </label>
                <textarea
                  id={fieldId}
                  autoFocus
                  value={commands}
                  onChange={(event) => {
                    void setRepoPostCreateCommands(path, event.target.value);
                  }}
                  spellCheck={false}
                  placeholder={`cp "$AUTOPILOT_MAIN_WORKTREE_PATH/.env" .env\nnpm install`}
                  className="min-h-[88px] w-full resize-y rounded-md border border-border bg-tertiary px-2.5 py-2 font-mono text-[13px] leading-5 text-primary outline-none placeholder:text-muted focus:ring-2 focus:ring-accent-primary"
                />
                <p className="text-xs leading-5 text-tertiary">
                  Variables:{" "}
                  {["AUTOPILOT_REPO_PATH", "AUTOPILOT_MAIN_WORKTREE_PATH", "AUTOPILOT_WORKTREE_PATH", "AUTOPILOT_WORKTREE_NAME"].map((name, index) => (
                    <span key={name}>
                      {index > 0 ? ", " : null}
                      <code className="font-mono text-[11px] text-secondary">${name}</code>
                    </span>
                  ))}
                </p>
              </div>
            ) : null}
          </div>
        );
      })}
    </SettingsGroup>
  );
}

function PlaceholderSection({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <h4 className="mb-1 text-sm font-medium text-primary">{title}</h4>
      <p className="max-w-[240px] text-xs leading-5 text-tertiary">{description}</p>
    </div>
  );
}
