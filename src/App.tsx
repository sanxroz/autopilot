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
import { useAppStore } from "./store";
import { useGitWatcher } from "./hooks/useGitWatcher";
import { useUpdater } from "./hooks/useUpdater";
import { useDiffStatsLoader } from "./hooks/useDiffStats";
import { useProcessStatusPolling } from "./hooks/useProcessStatus";
import type { AgentStatusEvent } from "./types";

function App() {
  const initialize = useAppStore((state) => state.initialize);
  const selectedWorktree = useAppStore((state) => state.selectedWorktree);
  const codeReviewOpen = useAppStore((state) => state.codeReviewOpen);
  const diffOverlayOpen = useAppStore((state) => state.diffOverlayOpen);
  const setDiffOverlayOpen = useAppStore((state) => state.setDiffOverlayOpen);
  const diffViewMode = useAppStore((state) => state.diffViewMode);
  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const toggleSettings = useAppStore((state) => state.toggleSettings);
  const setAgentRunState = useAppStore((state) => state.setAgentRunState);
  const agentSidebarLifecycleEnabled = useAppStore((state) => state.agentSidebarLifecycleEnabled);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    initialize();
  }, [initialize]);

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
