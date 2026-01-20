import { useEffect, useState } from "react";
import { Navbar } from "./components/Navbar";
import { Sidebar } from "./components/Sidebar";
import { TerminalGrid } from "./components/TerminalGrid";
import { RightPanel } from "./components/RightPanel";
import { DiffOverlay } from "./components/DiffOverlay";
import { SettingsPanel } from "./components/SettingsPanel";
import { CommandMenu } from "./components/CommandMenu";
import { useAppStore } from "./store";
import { useTheme } from "./hooks/useTheme";
import { usePRStatusPolling } from "./hooks/usePRStatus";
import { useProcessStatusPolling } from "./hooks/useProcessStatus";
import { useGitWatcher } from "./hooks/useGitWatcher";

function App() {
  const initialize = useAppStore((state) => state.initialize);
  const selectedWorktree = useAppStore((state) => state.selectedWorktree);
  const codeReviewOpen = useAppStore((state) => state.codeReviewOpen);
  const setCodeReviewOpen = useAppStore((state) => state.setCodeReviewOpen);
  const diffOverlayOpen = useAppStore((state) => state.diffOverlayOpen);
  const setDiffOverlayOpen = useAppStore((state) => state.setDiffOverlayOpen);
  const diffViewMode = useAppStore((state) => state.diffViewMode);
  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const toggleSettings = useAppStore((state) => state.toggleSettings);
  const theme = useTheme();
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
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

  return (
    <div
      className="h-screen overflow-hidden rounded-lg flex flex-col"
      style={{ background: "transparent" }}
    >
      <div
        className="overflow-hidden backdrop-blur-md flex h-full"
        style={{
          background: theme.bg.primary,
          boxShadow: `inset 0 0 0 1px ${theme.border.subtle}`,
          color: theme.text.primary,
        }}
      >
        {sidebarOpen && <Sidebar />}
        <div className="flex flex-col flex-1 overflow-hidden relative">
          <Navbar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
          <TerminalGrid />
          {diffOverlayOpen && diffViewMode === 'overlay' && (
            <DiffOverlay
              worktreePath={selectedWorktree?.path ?? null}
              onClose={() => setDiffOverlayOpen(false)}
            />
          )}
        </div>
        {codeReviewOpen && (
          <RightPanel
            worktreePath={selectedWorktree?.path ?? null}
            onClose={() => setCodeReviewOpen(false)}
          />
        )}
      </div>

      {settingsOpen && <SettingsPanel onClose={toggleSettings} />}

      <CommandMenu open={commandMenuOpen} onOpenChange={setCommandMenuOpen} />
    </div>
  );
}

export default App;
