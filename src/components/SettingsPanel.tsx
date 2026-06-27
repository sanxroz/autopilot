import { useState } from "react";
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
} from "lucide-react";
import { Checkbox } from "./ui/checkbox";
import { useAppStore } from "../store";
import { cn } from "../utils/cn";
import { AI_AGENTS, type AIAgent, type Repository } from "../types";

interface SettingsPanelProps {
  onClose: () => void;
}

type NavSection =
  | "account"
  | "appearance"
  | "preferences"
  | "projects"
  | "skills"
  | "agents"
  | "mcp"
  | "debug";

interface NavItem {
  readonly id: NavSection;
  readonly label: string;
  readonly icon: React.ReactNode;
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
    <div className="space-y-1.5">
      <h4 className="text-xs font-medium uppercase tracking-[0.04em] text-tertiary">
        {title}
      </h4>
      {description ? (
        <p className="max-w-[52ch] text-sm leading-6 text-secondary">
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
    <div className={cn("rounded-xl border border-border bg-primary", className)}>
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
        "flex items-start justify-between gap-4 px-4 py-4 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border",
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
        <p className="max-w-[52ch] text-xs leading-5 text-tertiary">
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
    { id: "account", label: "Account", icon: <User className="w-3.5 h-3.5" /> },
    { id: "appearance", label: "Appearance", icon: <Palette className="w-3.5 h-3.5" /> },
    { id: "preferences", label: "Preferences", icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
    { id: "projects", label: "Projects", icon: <FolderOpen className="w-3.5 h-3.5" /> },
    { id: "skills", label: "Skills", icon: <BookOpen className="w-3.5 h-3.5" />, beta: true },
    { id: "agents", label: "Custom Agents", icon: <Bot className="w-3.5 h-3.5" />, beta: true },
    { id: "mcp", label: "MCP Servers", icon: <Server className="w-3.5 h-3.5" /> },
    { id: "debug", label: "Debug", icon: <Bug className="w-3.5 h-3.5" /> },
  ];

  const sectionTitles: Record<NavSection, string> = {
    account: "Account",
    appearance: "Appearance",
    preferences: "Preferences",
    projects: "Projects",
    skills: "Skills",
    agents: "Custom Agents",
    mcp: "MCP Servers",
    debug: "Debug",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="flex h-[560px] w-full max-w-[900px] overflow-hidden rounded-xl border border-border bg-secondary shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex w-[220px] flex-shrink-0 flex-col bg-tertiary">
          <div className="px-4 py-4">
            <h2 className="text-sm font-semibold text-primary">Settings</h2>
          </div>

          <nav className="flex-1 px-2 pb-4">
            <ul className="space-y-0.5">
              {navItems.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => setActiveSection(item.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                        isActive ? "bg-active text-primary" : "text-secondary hover:bg-hover"
                      )}
                    >
                      <span className={isActive ? "text-primary" : "text-tertiary"}>
                        {item.icon}
                      </span>
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.beta ? (
                        <span className="rounded-full bg-hover px-1.5 py-0.5 text-[10px] font-medium text-tertiary">
                          Beta
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h3 className="text-sm font-semibold text-primary">
              {sectionTitles[activeSection]}
            </h3>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-tertiary transition-colors hover:bg-hover"
              aria-label="Close settings"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {activeSection === "account" ? (
              <AccountSection githubSettings={githubSettings} />
            ) : null}
            {activeSection === "appearance" ? (
              <PlaceholderSection
                title="Appearance"
                description="Customize the look and feel of the application."
              />
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
            {activeSection === "projects" ? (
              <ProjectsSection
                repositories={repositories}
                repoPostCreateCommandsByPath={repoPostCreateCommandsByPath}
                setRepoPostCreateCommands={setRepoPostCreateCommands}
              />
            ) : null}
            {activeSection === "skills" ? (
              <PlaceholderSection
                title="Skills"
                description="Manage your AI skills and capabilities."
              />
            ) : null}
            {activeSection === "agents" ? (
              <PlaceholderSection
                title="Custom Agents"
                description="Create and manage custom AI agents."
              />
            ) : null}
            {activeSection === "mcp" ? (
              <PlaceholderSection
                title="MCP Servers"
                description="Configure Model Context Protocol servers."
              />
            ) : null}
            {activeSection === "debug" ? (
              <DebugSection githubSettings={githubSettings} />
            ) : null}
          </div>

          <div className="flex justify-end border-t border-border px-6 py-4">
            <button
              onClick={onClose}
              className="rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-bg-primary transition-colors hover:bg-accent-hover"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountSection({
  githubSettings,
}: {
  githubSettings: { ghCliAvailable: boolean; ghAuthUser: string | null };
}) {
  return (
    <div className="space-y-6">
      <SectionHeading
        title="GitHub account"
        description="Connect the GitHub CLI once to keep pull request and review actions tied to your account."
      />

      <SettingsCard>
        {githubSettings.ghCliAvailable && githubSettings.ghAuthUser ? (
          <SettingsRow className="items-center">
            <div className="flex items-center gap-3">
              <img
                src={`https://github.com/${githubSettings.ghAuthUser}.png`}
                alt={githubSettings.ghAuthUser}
                className="h-12 w-12 rounded-full border border-border"
              />
              <div className="space-y-1">
                <div className="text-sm font-medium text-primary">
                  {githubSettings.ghAuthUser}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-tertiary">
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  <span>@{githubSettings.ghAuthUser}</span>
                </div>
              </div>
            </div>
          </SettingsRow>
        ) : (
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
                  <AlertCircle className="h-3.5 w-3.5 text-semantic-error" />
                </div>
                <p className="max-w-[48ch] text-xs leading-5 text-tertiary">
                  {githubSettings.ghCliAvailable
                    ? "Installed, but not authenticated. Run `gh auth login` to finish setup."
                    : "GitHub CLI is not installed yet. Run `brew install gh` before connecting your account."}
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
  return (
    <div className="space-y-6">
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
    <div className="space-y-8">
      <div className="space-y-3">
        <SectionHeading
          title="AI integration"
          description="Choose the default agent used for commit messages and other assistant-driven actions."
        />

        <div className="space-y-5">
          <div className="space-y-2">
            <SettingsLabel
              title="Default AI agent"
              description="Used automatically until a command overrides it."
            />
            <div className="relative">
              <button
                onClick={() => setIsOpen((open) => !open)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-primary transition-colors hover:bg-hover"
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
                <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-border bg-secondary py-1 shadow-lg">
                  {AI_AGENTS.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => {
                        void setDefaultAIAgent(agent.id);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between px-3 py-2 text-sm transition-colors",
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
          </div>

          <div className="space-y-2 border-t border-border pt-5">
            <div className="flex items-start justify-between gap-4">
              <SettingsLabel
                title="Auto-fetch tracked remotes"
                description="Keeps `main`-based diffs current in the background."
              />
              <Checkbox
                checked={autoFetchEnabled}
                onCheckedChange={(checked) => {
                  void setAutoFetchEnabled(checked === true);
                }}
                aria-label="Enable auto-fetch"
              />
            </div>

            <div className="space-y-2">
              <SettingsLabel
                title="Fetch interval"
                description="How often Autopilot runs `git fetch --all --prune`."
              />
              <select
                value={String(autoFetchIntervalMinutes)}
                onChange={(event) => {
                  void setAutoFetchIntervalMinutes(Number(event.target.value));
                }}
                disabled={!autoFetchEnabled}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-primary outline-none transition-shadow focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {AUTO_FETCH_INTERVAL_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    Every {minutes} minutes
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
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
  if (repositories.length === 0) {
    return (
      <PlaceholderSection
        title="No projects yet"
        description="Add a repository first, then configure the commands that should run after each new workspace is created."
      />
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Post-create scripts"
        description="These commands run inside each new worktree right after it is created."
      />

      <div className="space-y-2">
        <SettingsLabel title="Need a prompt?" />
        <textarea
          readOnly
          value='Write a post-create shell script for this repo. Keep it idempotent, use POSIX shell, and copy any shared files from `AUTOPILOT_MAIN_WORKTREE_PATH` only when they exist.'
          className="min-h-[88px] w-full rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm leading-6 text-primary outline-none"
        />
      </div>

      <div className="space-y-4">
        {repositories.map((repository) => {
          const commands = repoPostCreateCommandsByPath[repository.info.path] ?? "";

          return (
            <div key={repository.info.path} className="space-y-2 border-t border-border pt-4 first:border-t-0 first:pt-0">
              <div className="space-y-1">
                <div className="text-sm font-medium text-primary">
                  {repository.info.name}
                </div>
                <div className="break-all text-xs leading-5 text-tertiary">
                  {repository.info.path}
                </div>
              </div>

              <textarea
                id={`post-create-${repository.info.path}`}
                value={commands}
                onChange={(event) => {
                  void setRepoPostCreateCommands(
                    repository.info.path,
                    event.target.value
                  );
                }}
                placeholder={`cp "$AUTOPILOT_MAIN_WORKTREE_PATH/.env" .env\nnpm install`}
                className="min-h-[120px] w-full rounded-lg border border-border bg-secondary px-3 py-2.5 font-mono text-xs text-primary outline-none transition-shadow focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-secondary"
              />

              <p className="text-xs leading-5 text-tertiary">
                Available env vars: `AUTOPILOT_REPO_PATH`, `AUTOPILOT_MAIN_WORKTREE_PATH`,
                `AUTOPILOT_WORKTREE_PATH`, `AUTOPILOT_WORKTREE_NAME`.
              </p>
            </div>
          );
        })}
      </div>
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
    <div className="flex h-full flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-tertiary">
        <SlidersHorizontal className="h-3.5 w-3.5 text-tertiary" />
      </div>
      <h4 className="mb-1 text-sm font-medium text-primary">{title}</h4>
      <p className="max-w-[240px] text-xs leading-5 text-tertiary">{description}</p>
    </div>
  );
}
