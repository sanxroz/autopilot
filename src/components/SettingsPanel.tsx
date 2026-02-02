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
} from "lucide-react";
import { useAppStore } from "../store";
import { cn } from "../utils/cn";
import { AI_AGENTS, type AIAgent } from "../types";


interface SettingsPanelProps {
  onClose: () => void;
}

type NavSection =
  | "account"
  | "appearance"
  | "preferences"
  | "skills"
  | "agents"
  | "mcp"
  | "debug";

interface NavItem {
  id: NavSection;
  label: string;
  icon: React.ReactNode;
  beta?: boolean;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { githubSettings, defaultAIAgent, setDefaultAIAgent } = useAppStore();
  const [activeSection, setActiveSection] = useState<NavSection>("account");

  const navItems: NavItem[] = [
    { id: "account", label: "Account", icon: <User className="w-3.5 h-3.5" /> },
    { id: "appearance", label: "Appearance", icon: <Palette className="w-3.5 h-3.5" /> },
    { id: "preferences", label: "Preferences", icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
    { id: "skills", label: "Skills", icon: <BookOpen className="w-3.5 h-3.5" />, beta: true },
    { id: "agents", label: "Custom Agents", icon: <Bot className="w-3.5 h-3.5" />, beta: true },
    { id: "mcp", label: "MCP Servers", icon: <Server className="w-3.5 h-3.5" /> },
    { id: "debug", label: "Debug", icon: <Bug className="w-3.5 h-3.5" /> },
  ];

  const sectionTitles: Record<NavSection, string> = {
    account: "Account",
    appearance: "Appearance",
    preferences: "Preferences",
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
        className="w-full max-w-[800px] rounded-xl shadow-2xl flex overflow-hidden h-[520px] bg-secondary border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-[220px] flex-shrink-0 flex flex-col bg-tertiary">
          <div className="px-4 py-4">
            <h2 className="text-sm font-semibold text-primary">
              Settings
            </h2>
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
                        "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                        isActive ? "bg-active text-primary" : "text-secondary hover:bg-hover"
                      )}
                    >
                      <span className={isActive ? "text-primary" : "text-tertiary"}>
                        {item.icon}
                      </span>
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.beta && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-hover text-tertiary">
                          Beta
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-primary">
              {sectionTitles[activeSection]}
            </h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md transition-colors text-tertiary hover:bg-hover"
              aria-label="Close settings"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {activeSection === "account" && <AccountSection githubSettings={githubSettings} />}
            {activeSection === "appearance" && <PlaceholderSection title="Appearance" description="Customize the look and feel of the application." />}
            {activeSection === "preferences" && (
              <PreferencesSection
                defaultAIAgent={defaultAIAgent}
                setDefaultAIAgent={setDefaultAIAgent}
              />
            )}
            {activeSection === "skills" && <PlaceholderSection title="Skills" description="Manage your AI skills and capabilities." />}
            {activeSection === "agents" && <PlaceholderSection title="Custom Agents" description="Create and manage custom AI agents." />}
            {activeSection === "mcp" && <PlaceholderSection title="MCP Servers" description="Configure Model Context Protocol servers." />}
            {activeSection === "debug" && (
              <DebugSection githubSettings={githubSettings} />
            )}
          </div>

          <div className="flex justify-end px-6 py-4 border-t border-border">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-accent-primary text-primary hover:bg-accent-hover"
            >
              Save
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
      <div>
        <h4 className="text-xs font-medium uppercase mb-4 text-tertiary">
          GitHub Account
        </h4>

        {githubSettings.ghCliAvailable && githubSettings.ghAuthUser ? (
          <div className="flex items-center gap-4">
            <img
              src={`https://github.com/${githubSettings.ghAuthUser}.png`}
              alt={githubSettings.ghAuthUser}
              className="w-16 h-16 rounded-full border-2 border-border"
            />
            <div className="flex flex-col gap-1">
              <span className="text-lg font-semibold text-primary">
                {githubSettings.ghAuthUser}
              </span>
              <div className="flex items-center gap-1.5">
                <svg
                  className="w-3.5 h-3.5 text-tertiary"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                <span className="text-sm text-tertiary">
                  {githubSettings.ghAuthUser}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-lg border bg-primary border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-tertiary">
                <Terminal className="w-3.5 h-3.5 text-secondary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-primary">
                    GitHub CLI
                  </span>
                  <AlertCircle className="w-3.5 h-3.5 text-semantic-error" />
                </div>
                <p className="text-xs mt-0.5 text-tertiary">
                  {githubSettings.ghCliAvailable
                    ? "Installed but not authenticated. Run: gh auth login"
                    : "Not installed. Run: brew install gh"}
                </p>
              </div>
            </div>
            {!githubSettings.ghCliAvailable && (
              <p className="text-xs mt-3 text-tertiary">
                Install the GitHub CLI to enable account integration.{" "}
                <a
                  href="https://cli.github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-accent-primary"
                >
                  Learn more
                </a>
              </p>
            )}
          </div>
        )}
      </div>
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
      <div>
        <h4 className="text-xs font-medium uppercase mb-4 text-tertiary">
          GitHub Integration
        </h4>

        <div className="space-y-4">
          <div className="p-3 rounded-lg border bg-primary border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-tertiary">
                <Terminal className="w-3.5 h-3.5 text-secondary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-primary">
                    GitHub CLI
                  </span>
                  {githubSettings.ghCliAvailable ? (
                    <Check className="w-3.5 h-3.5 text-semantic-success" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-semantic-error" />
                  )}
                </div>
                <p className="text-xs mt-0.5 text-tertiary">
                  {githubSettings.ghCliAvailable
                    ? githubSettings.ghAuthUser
                      ? `Authenticated as @${githubSettings.ghAuthUser}`
                      : "Installed but not authenticated"
                    : "Not installed - run: brew install gh"}
                </p>
              </div>
            </div>
          </div>

          {!githubSettings.ghCliAvailable && (
            <p className="text-xs text-tertiary">
              Install the GitHub CLI to enable PR status tracking.{" "}
              <a
                href="https://cli.github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-accent-primary"
              >
                Learn more
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PreferencesSection({
  defaultAIAgent,
  setDefaultAIAgent,
}: {
  defaultAIAgent: AIAgent;
  setDefaultAIAgent: (agent: AIAgent) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedAgent = AI_AGENTS.find((a) => a.id === defaultAIAgent) || AI_AGENTS[0];

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-xs font-medium uppercase mb-4 text-tertiary">
          AI Integration
        </h4>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-primary">
              Default AI Agent
            </label>
            <p className="text-xs mb-3 text-tertiary">
              Choose the AI agent to use for generating commit messages and other tasks.
            </p>
            <div className="relative">
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors bg-primary border border-border text-primary"
              >
                <span>{selectedAgent.name}</span>
                <ChevronDown
                  className={cn("w-4 h-4 transition-transform text-tertiary", isOpen && "rotate-180")}
                />
              </button>
              {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-lg shadow-lg z-10 py-1 bg-secondary border border-border">
                  {AI_AGENTS.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => {
                        setDefaultAIAgent(agent.id);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 text-sm transition-colors",
                        agent.id === defaultAIAgent ? "text-primary bg-active" : "text-secondary hover:bg-hover"
                      )}
                    >
                      <div className="flex flex-col items-start">
                        <span>{agent.name}</span>
                        <span className="text-xs text-muted">
                          {agent.command}
                        </span>
                      </div>
                      {agent.id === defaultAIAgent && (
                        <Check className="w-4 h-4 text-semantic-success" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
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
    <div className="flex flex-col items-center justify-center h-full text-center py-12">
      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4 bg-tertiary">
        <SlidersHorizontal className="w-3.5 h-3.5 text-tertiary" />
      </div>
      <h4 className="text-sm font-medium mb-1 text-primary">
        {title}
      </h4>
      <p className="text-xs max-w-[240px] text-tertiary">
        {description}
      </p>
    </div>
  );
}
