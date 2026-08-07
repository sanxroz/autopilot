import { useCallback, useEffect, useRef, useState } from "react";
import { WorkspaceHeader } from "./components/WorkspaceHeader";
import type { RightPanelTabId } from "./components/RightPanelToolbar";
import { Sidebar } from "./components/Sidebar";
import { TerminalGrid } from "./components/TerminalGrid";
import { CaptainTerminalGrid } from "./components/CaptainTerminalGrid";
import { RightPanel } from "./components/RightPanel";
import { GitFileDiffOverlay } from "./components/GitFileDiffOverlay";
import { SettingsPanel } from "./components/SettingsPanel";
import { CommandMenu } from "./components/CommandMenu";
import { UpdateNotification } from "./components/UpdateNotification";
import { Toaster } from "sonner";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { exit } from "@tauri-apps/plugin-process";
import { useAppStore } from "./store";
import { usePRStatusPolling } from "./hooks/usePRStatus";
import { useGitWatcher } from "./hooks/useGitWatcher";
import { useUpdater } from "./hooks/useUpdater";
import { useDiffStatsLoader } from "./hooks/useDiffStats";
import { useProcessStatusPolling } from "./hooks/useProcessStatus";
import type { AgentStatusEvent } from "./types";
import { getShortcutAction, type ShortcutAction } from "./lib/keyboard-shortcuts";
import {
  cycleItems,
  getNavigableSessions,
  orderSessionsByPath,
} from "./lib/session-navigation";

function focusTerminal(terminalId: string | null) {
  if (!terminalId) return;
  const terminal = Array.from(
    document.querySelectorAll<HTMLElement>("[data-terminal-id]"),
  ).find((element) => element.dataset.terminalId === terminalId);
  terminal?.querySelector<HTMLElement>(".xterm-helper-textarea")?.focus();
}

function App() {
  const autoFetchInFlightRef = useRef(false);
  const initialize = useAppStore((state) => state.initialize);
  const preloadInstalledIdes = useAppStore((state) => state.preloadInstalledIdes);
  const selectedWorktree = useAppStore((state) => state.selectedWorktree);
  const codeReviewOpen = useAppStore((state) => state.codeReviewOpen);
  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const toggleSettings = useAppStore((state) => state.toggleSettings);
  const setAgentRunState = useAppStore((state) => state.setAgentRunState);
  const flushSidebarNotesPersistence = useAppStore((state) => state.flushSidebarNotesPersistence);
  const agentSidebarLifecycleEnabled = useAppStore((state) => state.agentSidebarLifecycleEnabled);
  const repositories = useAppStore((state) => state.repositories);
  const autoFetchSettings = useAppStore((state) => state.autoFetchSettings);
  const refreshWorktrees = useAppStore((state) => state.refreshWorktrees);
  const keyboardShortcuts = useAppStore((state) => state.keyboardShortcuts);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTabId>("git");
  const [captainTerminalRepoPath, setCaptainTerminalRepoPath] = useState<string | null>(null);

  const runShortcutAction = useCallback((action: ShortcutAction) => {
    const state = useAppStore.getState();

    switch (action) {
      case "commandMenu":
        setCommandMenuOpen((open) => !open);
        break;
      case "settings":
        state.toggleSettings();
        break;
      case "toggleSidebar":
        setSidebarOpen((open) => !open);
        break;
      case "toggleWorkspacePanel":
        state.toggleCodeReview();
        break;
      case "focusTerminal":
        focusTerminal(state.currentActiveTerminalId);
        break;
      case "previousTerminal":
      case "nextTerminal": {
        const terminals = state.currentTerminals;
        const current = terminals.find((terminal) => terminal.id === state.currentActiveTerminalId) ?? null;
        const terminal = cycleItems(terminals, current, action === "nextTerminal" ? 1 : -1);
        if (terminal) {
          state.setActiveTerminal(terminal.id);
          requestAnimationFrame(() => focusTerminal(terminal.id));
        }
        break;
      }
      case "previousSession":
      case "nextSession": {
        const allSessions = getNavigableSessions(state.repositories);
        const visibleSessionPaths = Array.from(
          document.querySelectorAll<HTMLElement>("[data-worktree-path]"),
          (element) => element.dataset.worktreePath,
        ).filter((path): path is string => path !== undefined);
        const sessions = visibleSessionPaths.length > 0
          ? orderSessionsByPath(allSessions, visibleSessionPaths)
          : allSessions;
        const current = sessions.find((worktree) => worktree.path === state.selectedWorktree?.path) ?? null;
        const session = cycleItems(sessions, current, action === "nextSession" ? 1 : -1);
        if (session) void state.selectWorktree(session);
        break;
      }
      case "previousSpace":
      case "nextSpace": {
        const spaces = Array.from(
          document.querySelectorAll<HTMLButtonElement>("[data-space-path]"),
        );
        const current = spaces.find((space) => space.getAttribute("aria-pressed") === "true") ?? null;
        cycleItems(spaces, current, action === "nextSpace" ? 1 : -1)?.click();
        break;
      }
      case "previousLayout":
      case "nextLayout": {
        const tabs = state.currentTerminalTabs;
        const current = tabs.find((tab) => tab.id === state.currentActiveTerminalTabId) ?? null;
        const tab = cycleItems(tabs, current, action === "nextLayout" ? 1 : -1);
        if (tab) state.setActiveTerminalTab(tab.id);
        break;
      }
      case "showGit":
      case "showNotes":
        state.setCodeReviewOpen(true);
        setRightPanelTab(action === "showGit" ? "git" : "notes");
        break;
      case "openWith":
        state.setCodeReviewOpen(true);
        window.setTimeout(() => {
          document.querySelector<HTMLElement>("[data-shortcut-action='open-with']")?.click();
        });
        break;
    }
  }, []);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    void preloadInstalledIdes();
  }, [preloadInstalledIdes]);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let isMounted = true;
    let isClosing = false;
    let unlistenCloseRequested: (() => void) | null = null;

    const handleBeforeUnload = () => {
      void flushSidebarNotesPersistence();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    appWindow.onCloseRequested(async (event) => {
      if (isClosing) {
        return;
      }

      event.preventDefault();

      try {
        await flushSidebarNotesPersistence();
      } catch (error) {
        console.error("Failed to flush sidebar notes before close:", error);
      }

      isClosing = true;
      await exit(0);
    })
      .then((fn) => {
        if (isMounted) {
          unlistenCloseRequested = fn;
          return;
        }

        fn();
      })
      .catch((error) => {
        console.error("Failed to subscribe to close-requested events:", error);
      });

    return () => {
      isMounted = false;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (unlistenCloseRequested) {
        unlistenCloseRequested();
      }
    };
  }, [flushSidebarNotesPersistence]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const action = getShortcutAction(e, keyboardShortcuts);
      if (!action) return;

      const state = useAppStore.getState();
      if (state.settingsOpen && action !== "settings") return;
      e.preventDefault();
      runShortcutAction(action);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [keyboardShortcuts, runShortcutAction]);

  useEffect(() => {
    setCaptainTerminalRepoPath(null);
  }, [selectedWorktree?.path]);

  usePRStatusPolling();
  useProcessStatusPolling();
  useGitWatcher();
  useDiffStatsLoader();

  useEffect(() => {
    if (!agentSidebarLifecycleEnabled) return;

    let isMounted = true;
    let unlisten: (() => void) | null = null;

    listen<AgentStatusEvent>("agent-status-changed", (event) => {
      if (!isMounted) return;
      console.log('[autopilot:event]', event.payload.status, event.payload.agent, event.payload.worktreePath, event.payload.message);
      setAgentRunState(event.payload);
    })
      .then((fn) => {
        if (isMounted) {
          unlisten = fn;
          return;
        }
        fn();
      })
      .catch((error) => {
        console.error("Failed to subscribe to agent lifecycle events:", error);
      });

    return () => {
      isMounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, [agentSidebarLifecycleEnabled, setAgentRunState]);

  useEffect(() => {
    if (!autoFetchSettings.enabled || repositories.length === 0) {
      return;
    }

    const intervalMs = Math.max(autoFetchSettings.intervalMinutes, 1) * 60 * 1000;
    const fetchAllRepositories = async () => {
      if (autoFetchInFlightRef.current) {
        return;
      }

      autoFetchInFlightRef.current = true;

      try {
        await Promise.allSettled(
          repositories.map(async (repo) => {
            await invoke("git_fetch", { repoPath: repo.info.path });
            await refreshWorktrees(repo.info.path);
          })
        );
      } finally {
        autoFetchInFlightRef.current = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void fetchAllRepositories();
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [autoFetchSettings, refreshWorktrees, repositories]);

  const {
    status: updateStatus,
    updateInfo,
    downloadProgress,
    error: updateError,
    downloadAndInstall,
    restart,
    dismissUpdate,
    checkForUpdates,
  } = useUpdater();

  const [updateModalOpen, setUpdateModalOpen] = useState(false);

  useEffect(() => {
    if (updateStatus === "available") {
      setUpdateModalOpen(true);
    }
  }, [updateStatus]);

  const captainRepository = repositories.find(
    (repository) => repository.info.path === captainTerminalRepoPath
  );
  const captainHeaderWorktree = captainRepository
    ? captainRepository.worktrees.find(
      (worktree) => worktree.path === captainRepository.info.path
    ) ?? captainRepository.worktrees.find((worktree) => worktree.name === "main")
    : null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden rounded-xl bg-solid">
      <div className="flex h-full min-h-0 overflow-hidden text-primary">
        <Sidebar
          isOpen={sidebarOpen}
          captainTerminalRepoPath={captainTerminalRepoPath}
          onToggleCaptainTerminal={(repoPath) => {
            setCaptainTerminalRepoPath((current) =>
              current === repoPath ? null : repoPath
            );
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden px-1.5">
          <WorkspaceHeader
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            onOpenCommandMenu={() => setCommandMenuOpen(true)}
            headerWorktree={captainHeaderWorktree}
            rightPanelTab={rightPanelTab}
            onRightPanelTabChange={setRightPanelTab}
          />
          <div className="flex min-h-0 flex-1 gap-1.5 pb-1.5">
            <main className="app-panel relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border-subtle bg-primary">
              <TerminalGrid />
              {repositories.map((repository) => (
                <CaptainTerminalGrid
                  key={repository.info.path}
                  open={captainTerminalRepoPath === repository.info.path}
                  repositoryRoot={repository.info.path}
                  onClose={() => setCaptainTerminalRepoPath(null)}
                />
              ))}
              <GitFileDiffOverlay />
            </main>
            {codeReviewOpen && (
              <RightPanel
                worktreePath={selectedWorktree?.path ?? null}
                activeTab={rightPanelTab}
              />
            )}
          </div>
        </div>
      </div>

      {settingsOpen && <SettingsPanel onClose={toggleSettings} />}

      <CommandMenu
        open={commandMenuOpen}
        onOpenChange={setCommandMenuOpen}
        onRunAction={runShortcutAction}
      />

      <UpdateNotification
        open={updateModalOpen}
        onOpenChange={setUpdateModalOpen}
        updateInfo={updateInfo}
        downloadProgress={downloadProgress}
        status={updateStatus}
        error={updateError}
        onUpdate={downloadAndInstall}
        onLater={dismissUpdate}
        onRestart={restart}
        onRetry={checkForUpdates}
      />

      <Toaster position="bottom-right" theme="system" />
    </div>
  );
}

export default App;
