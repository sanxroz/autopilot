import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  X,
  Check,
  AlertCircle,
  Terminal,
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
  Github,
  Search,
} from "lucide-react";
import { Checkbox } from "./ui/checkbox";
import { useAppStore } from "../store";
import { cn } from "../utils/cn";
import { Tooltip } from "./ui/tooltip";
import { AI_AGENTS, type AIAgent, type Repository } from "../types";
import { useThemeMode } from "../hooks/useTheme";
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  SHORTCUT_DEFINITIONS,
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
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-tertiary">
        {title}
      </h4>
      {description ? (
        <p className="max-w-[56ch] text-[13px] leading-5 text-secondary">
          {description}
        </p>
      ) : null}
    </div>
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
    <div className={className}>
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
        "flex items-start justify-between gap-3 px-3 py-3",
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
    <div className="space-y-1">
      <div className="text-sm font-medium text-primary">{title}</div>
      {description ? (
        <p className="max-w-[52ch] text-xs leading-4 text-tertiary">
          {description}
        </p>
      ) : null}
    </div>
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
              <AccountSection githubSettings={githubSettings} />
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
            className="h-9 w-full rounded-md border border-border-subtle bg-primary pl-8 pr-3 text-sm text-primary outline-none placeholder:text-tertiary focus:ring-2 focus:ring-accent-primary"
          />
        </label>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={isLoading}
          aria-label={`Refresh ${copy.label}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-primary text-secondary hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-60"
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin motion-reduce:animate-none")} />
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
      <SettingsCard>
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
          <SettingsRow key={`${resource.kind}:${resource.path}:${resource.name}`} className="items-center">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-tertiary text-secondary">
                <ResourceIcon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-primary">{resource.name}</div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-tertiary" title={resource.path}>
                  {resource.path}
                </div>
              </div>
            </div>
            <span className="shrink-0 rounded-md bg-tertiary px-2 py-1 text-[11px] font-medium text-secondary">
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
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="rounded-lg bg-semantic-error/10 px-3 py-2 text-xs text-semantic-error">
          {error}
        </p>
      ) : null}

      <SettingsCard>
        {SHORTCUT_DEFINITIONS.map((definition) => {
          const shortcut = keyboardShortcuts[definition.id];
          const isRecording = recording === definition.id;
          const isDefault = shortcut === DEFAULT_KEYBOARD_SHORTCUTS[definition.id];
          return (
            <SettingsRow key={definition.id} className="items-center py-3">
              <SettingsLabel title={definition.label} description={definition.description} />
              <div className="flex shrink-0 items-center gap-2">
                {!isDefault ? (
                  <button
                    type="button"
                    onClick={() => saveShortcut(definition.id, DEFAULT_KEYBOARD_SHORTCUTS[definition.id])}
                    className="h-9 rounded-md px-2 text-xs text-tertiary hover:bg-hover hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary"
                  >
                    Reset
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setRecording(definition.id);
                    setError(null);
                  }}
                  onBlur={() => setRecording((current) => current === definition.id ? null : current)}
                  onKeyDown={(event) => recordShortcut(definition.id, event)}
                  aria-label={`Change ${definition.label} shortcut`}
                  className={cn(
                    "h-9 min-w-24 rounded-md border px-2.5 font-mono text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary",
                    isRecording
                      ? "border-accent-primary bg-active text-primary"
                      : "border-border bg-secondary text-secondary hover:bg-hover",
                  )}
                >
                  {isRecording ? "Press keys…" : formatShortcut(shortcut)}
                </button>
              </div>
            </SettingsRow>
          );
        })}
      </SettingsCard>
    </div>
  );
}

function AccountSection({
  githubSettings,
}: {
  githubSettings: { ghCliAvailable: boolean; ghAuthUser: string | null };
}) {
  return (
    <div className="space-y-3">
      <SectionHeading title="GitHub connection" />
      <SettingsCard>
        {githubSettings.ghCliAvailable && githubSettings.ghAuthUser ? (
          <>
            <SettingsRow className="items-center rounded-lg bg-tertiary">
              <SettingsLabel title="Profile" />
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src={`https://github.com/${githubSettings.ghAuthUser}.png?size=128`}
                  alt=""
                  className="h-10 w-10 rounded-md"
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-primary">
                    {githubSettings.ghAuthUser}
                  </div>
                  <div className="text-xs text-tertiary">@{githubSettings.ghAuthUser}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void openUrl(`https://github.com/${githubSettings.ghAuthUser}`)}
                  className="ml-3 flex h-9 shrink-0 items-center rounded-md px-2.5 text-xs font-medium text-secondary hover:bg-hover hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary"
                >
                  View profile
                </button>
              </div>
            </SettingsRow>
            <SettingsRow className="mt-2 items-center rounded-lg bg-tertiary">
              <SettingsLabel title="GitHub CLI" />
              <div className="flex items-center gap-1.5 text-xs text-secondary">
                <Check className="h-3.5 w-3.5 text-semantic-success" />
                Authenticated
              </div>
            </SettingsRow>
          </>
        ) : (
          <SettingsRow className="rounded-lg bg-tertiary p-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-tertiary">
                <Github className="h-5 w-5 text-secondary" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-primary">
                    GitHub CLI
                  </span>
                  <AlertCircle className="h-3.5 w-3.5 text-semantic-error" />
                </div>
                <p className="max-w-[48ch] text-[13px] leading-5 text-secondary">
                  {githubSettings.ghCliAvailable
                    ? "Installed, but not authenticated. Run `gh auth login` to finish setup."
                    : "GitHub CLI is not installed yet. Run `brew install gh` before connecting your account."}
                </p>
                {!githubSettings.ghCliAvailable ? (
                  <a
                    href="https://cli.github.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center text-xs font-medium text-accent-primary transition-colors hover:text-accent-hover"
                  >
                    GitHub CLI docs
                  </a>
                ) : null}
              </div>
            </div>
          </SettingsRow>
        )}
      </SettingsCard>
    </div>
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
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <SectionHeading
            title="Terminal recovery"
            description="Inspect the foreground process in every worktree. Recovery ends only that process and keeps its terminal shell open."
          />
          <Tooltip content="Refresh diagnostics">
            <button
              type="button"
              onClick={() => void refreshDiagnostics()}
              disabled={isLoading}
              aria-label="Refresh terminal diagnostics"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-secondary hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-60"
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin motion-reduce:animate-none")} />
            </button>
          </Tooltip>
        </div>

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
              <SettingsRow key={terminal.terminalId} className="items-center">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-primary">
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
                  <p className="truncate text-xs text-tertiary" title={terminal.worktreePath}>
                    {terminal.worktreePath}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-secondary">
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
                          className="h-9 rounded-md px-2.5 text-xs text-secondary hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-60"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          autoFocus
                          onClick={() => void recoverTerminal(terminal)}
                          disabled={isRecovering}
                          className="h-9 rounded-md bg-semantic-error px-2.5 text-xs font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-semantic-error disabled:opacity-60"
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
                        className="h-9 rounded-md border border-border bg-secondary px-2.5 text-xs font-medium text-secondary hover:bg-hover hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary"
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

      <SectionHeading
        title="GitHub integration"
        description="Use this view to confirm the local GitHub CLI is available before debugging review or PR actions."
      />

      <SettingsCard>
        <SettingsRow>
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-md bg-tertiary p-2">
              <Terminal className="h-3.5 w-3.5 text-secondary" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-primary">
                  GitHub CLI
                </span>
                {githubSettings.ghCliAvailable ? (
                  <Check className="h-3.5 w-3.5 text-semantic-success" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-semantic-error" />
                )}
              </div>
              <p className="text-xs leading-5 text-tertiary">
                {githubSettings.ghCliAvailable
                  ? githubSettings.ghAuthUser
                    ? `Authenticated as @${githubSettings.ghAuthUser}.`
                    : "Installed, but not authenticated."
                  : "Not installed. Run `brew install gh` to enable GitHub-backed actions."}
              </p>
              {!githubSettings.ghCliAvailable ? (
                <a
                  href="https://cli.github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex text-xs font-medium text-accent-primary transition-colors hover:text-accent-hover"
                >
                  GitHub CLI docs
                </a>
              ) : null}
            </div>
          </div>
        </SettingsRow>
      </SettingsCard>
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
}: {
  defaultAIAgent: AIAgent;
  setDefaultAIAgent: (agent: AIAgent) => Promise<void>;
  autoFetchEnabled: boolean;
  autoFetchIntervalMinutes: number;
  setAutoFetchEnabled: (enabled: boolean) => Promise<void>;
  setAutoFetchIntervalMinutes: (intervalMinutes: number) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedAgent =
    AI_AGENTS.find((agent) => agent.id === defaultAIAgent) ?? AI_AGENTS[0];

  return (
    <SettingsCard>
      <SettingsRow className="items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-tertiary text-secondary">
                <Bot className="h-3.5 w-3.5" />
              </div>
              <SettingsLabel title="Default AI agent" description="Used for assistant actions." />
            </div>
            <div className="relative w-56 shrink-0">
              <button
                type="button"
                onClick={() => setIsOpen((open) => !open)}
                aria-expanded={isOpen}
                className="flex h-9 w-full items-center justify-between rounded-md border border-border bg-secondary px-2.5 text-sm text-primary transition-colors hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary"
              >
                <span>{selectedAgent.name}</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-tertiary transition-transform",
                    isOpen && "rotate-180"
                  )}
                />
              </button>
              {isOpen ? (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg bg-solid py-1 shadow-xl ring-1 ring-border">
                  {AI_AGENTS.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => {
                        void setDefaultAIAgent(agent.id);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "flex h-10 w-full items-center justify-between px-3 text-sm transition-colors",
                        agent.id === defaultAIAgent
                          ? "bg-active text-primary"
                          : "text-secondary hover:bg-hover"
                      )}
                    >
                      <span className="flex flex-col items-start">
                        <span>{agent.name}</span>
                        <span className="text-xs text-muted">{agent.command}</span>
                      </span>
                      {agent.id === defaultAIAgent ? (
                        <Check className="h-4 w-4 text-semantic-success" />
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
      </SettingsRow>
      <SettingsRow className="items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-tertiary text-secondary">
            <RefreshCw className="h-3.5 w-3.5" />
          </div>
          <SettingsLabel title="Auto-fetch remotes" description="Keep remote branches current." />
        </div>
        <Checkbox
          checked={autoFetchEnabled}
          onCheckedChange={(checked) => {
            void setAutoFetchEnabled(checked === true);
          }}
          aria-label="Enable auto-fetch"
        />
      </SettingsRow>
      <SettingsRow className="items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-tertiary text-secondary">
            <Terminal className="h-3.5 w-3.5" />
          </div>
          <SettingsLabel title="Fetch interval" />
        </div>
        <select
          value={String(autoFetchIntervalMinutes)}
          onChange={(event) => {
            void setAutoFetchIntervalMinutes(Number(event.target.value));
          }}
          disabled={!autoFetchEnabled}
          className="h-9 w-56 shrink-0 rounded-md border border-border bg-secondary px-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-accent-primary disabled:cursor-not-allowed disabled:text-muted"
        >
          {AUTO_FETCH_INTERVAL_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              Every {minutes} minutes
            </option>
          ))}
        </select>
      </SettingsRow>
    </SettingsCard>
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
  if (repositories.length === 0) {
    return (
      <PlaceholderSection
        title="No projects yet"
        description="Add a repository first, then configure the commands that should run after each new workspace is created."
      />
    );
  }

  return (
    <div className="space-y-3">
      {repositories.map((repository) => {
          const commands = repoPostCreateCommandsByPath[repository.info.path] ?? "";

          return (
            <SettingsCard key={repository.info.path}>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-tertiary text-secondary">
                  <FolderOpen className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-primary">
                    {repository.info.name}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-tertiary" title={repository.info.path}>
                    {repository.info.path}
                  </div>
                </div>
                <span className="text-[11px] font-medium text-tertiary">
                  {commands.trim() ? "Configured" : "Optional"}
                </span>
              </div>
              <div className="space-y-2 p-3">
                <label htmlFor={`post-create-${repository.info.path}`} className="text-[13px] font-medium text-primary">
                  Post-create commands
                </label>
                <textarea
                  id={`post-create-${repository.info.path}`}
                  value={commands}
                  onChange={(event) => {
                    void setRepoPostCreateCommands(repository.info.path, event.target.value);
                  }}
                  spellCheck={false}
                  placeholder={`cp "$AUTOPILOT_MAIN_WORKTREE_PATH/.env" .env\nnpm install`}
                  className="min-h-[88px] w-full resize-y rounded-md border border-border bg-secondary px-2.5 py-2 font-mono text-sm leading-5 text-primary outline-none placeholder:text-tertiary focus:ring-2 focus:ring-accent-primary"
                />
                <p className="text-xs leading-5 text-tertiary">
                  Runs from the new worktree. Available variables: `AUTOPILOT_REPO_PATH`, `AUTOPILOT_MAIN_WORKTREE_PATH`, `AUTOPILOT_WORKTREE_PATH`, and `AUTOPILOT_WORKTREE_NAME`.
                </p>
              </div>
            </SettingsCard>
          );
      })}
    </div>
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
