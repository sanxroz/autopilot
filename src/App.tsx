import { useEffect, useState } from "react";
import { Navbar } from "./components/Navbar";
import { Sidebar } from "./components/Sidebar";
import { TerminalGrid } from "./components/TerminalGrid";
import { RightPanel } from "./components/RightPanel";
import { DiffOverlay } from "./components/DiffOverlay";
import { GitFileDiffOverlay } from "./components/GitFileDiffOverlay";
import { SettingsPanel } from "./components/SettingsPanel";
import { CommandMenu } from "./components/CommandMenu";
import { UpdateNotification } from "./components/UpdateNotification";
import { Toaster } from "sonner";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "./store";
import { usePRStatusPolling } from "./hooks/usePRStatus";
import { useGitWatcher } from "./hooks/useGitWatcher";
import { useUpdater } from "./hooks/useUpdater";
import { useDiffStatsLoader } from "./hooks/useDiffStats";
import { useProcessStatusPolling } from "./hooks/useProcessStatus";
import { preloadOpenWithIcons } from "./lib/open-with";
import type { AgentStatusEvent } from "./types";

function App() {
  const initialize = useAppStore((state) => state.initialize);
  const preloadInstalledIdes = useAppStore((state) => state.preloadInstalledIdes);
  const installedIdes = useAppStore((state) => state.installedIdes);
  const selectedWorktree = useAppStore((state) => state.selectedWorktree);
  const codeReviewOpen = useAppStore((state) => state.codeReviewOpen);
  const diffOverlayOpen = useAppStore((state) => state.diffOverlayOpen);
  const setDiffOverlayOpen = useAppStore((state) => state.setDiffOverlayOpen);
  const diffViewMode = useAppStore((state) => state.diffViewMode);
  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const toggleSettings = useAppStore((state) => state.toggleSettings);
  const setAgentRunState = useAppStore((state) => state.setAgentRunState);
  const flushSidebarNotesPersistence = useAppStore((state) => state.flushSidebarNotesPersistence);
  const agentSidebarLifecycleEnabled = useAppStore((state) => state.agentSidebarLifecycleEnabled);
  const repositories = useAppStore((state) => state.repositories);
  const autoFetchSettings = useAppStore((state) => state.autoFetchSettings);
  const refreshWorktrees = useAppStore((state) => state.refreshWorktrees);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    void preloadInstalledIdes();
  }, [preloadInstalledIdes]);

  useEffect(() => {
    preloadOpenWithIcons(installedIdes);
  }, [installedIdes]);

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
      await appWindow.destroy();
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
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "p") {
        e.preventDefault();
        setCommandMenuOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
      await Promise.allSettled(
        repositories.map(async (repo) => {
          await invoke("git_fetch", { repoPath: repo.info.path });
          await refreshWorktrees(repo.info.path);
        })
      );
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

  return (
    <div className="h-dvh overflow-hidden rounded-lg flex flex-col bg-transparent">
      <div className="overflow-hidden flex h-full bg-primary text-primary ring-1 ring-inset ring-border-subtle">
        <Sidebar isOpen={sidebarOpen} />
        <div className="flex flex-col flex-1 overflow-hidden relative">
          <Navbar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
          <TerminalGrid />
          {diffOverlayOpen && diffViewMode === 'overlay' && (
            <DiffOverlay
              worktreePath={selectedWorktree?.path ?? null}
              onClose={() => setDiffOverlayOpen(false)}
            />
          )}
          <GitFileDiffOverlay />
        </div>
        {codeReviewOpen && (
          <RightPanel
            worktreePath={selectedWorktree?.path ?? null}
          />
        )}
      </div>

      {settingsOpen && <SettingsPanel onClose={toggleSettings} />}

      <CommandMenu open={commandMenuOpen} onOpenChange={setCommandMenuOpen} />

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
