import { useEffect, useCallback, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { PackagePlus } from "lucide-react";
import { useAppStore } from "../store";
import { Terminal } from "./Terminal";
import type { TerminalHandle } from "./Terminal";
import { TerminalSearchBar } from "./TerminalSearchBar";
import { TerminalAnimation } from "./TerminalAnimation";

export function TerminalGrid() {
  const selectedWorktree = useAppStore((state) => state.selectedWorktree);
  const terminals = useAppStore((state) => state.currentTerminals);
  const activeTerminalId = useAppStore(
    (state) => state.currentActiveTerminalId
  );
  const terminalsByWorktree = useAppStore((state) => state.terminalsByWorktree);
  const setActiveTerminal = useAppStore((state) => state.setActiveTerminal);
  const addTerminal = useAppStore((state) => state.addTerminal);
  const removeTerminal = useAppStore((state) => state.removeTerminal);
  const addRepository = useAppStore((state) => state.addRepository);

  const terminalRefs = useRef<Map<string, TerminalHandle>>(new Map());
  const [searchOpenIds, setSearchOpenIds] = useState<Set<string>>(new Set());

  const handleAddRepository = async () => {
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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;

      if (isMeta && e.key === "d" && !e.shiftKey) {
        e.preventDefault();
        addTerminal();
      }

      if (isMeta && e.key === "w") {
        e.preventDefault();
        if (activeTerminalId) {
          removeTerminal(activeTerminalId);
        }
      }

      if (isMeta && e.key === "f" && activeTerminalId) {
        e.preventDefault();
        setSearchOpenIds((prev) => new Set(prev).add(activeTerminalId));
      }
    },
    [activeTerminalId, addTerminal, removeTerminal]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const allWorktreePaths = Object.keys(terminalsByWorktree);

  if (!selectedWorktree && allWorktreePaths.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-transparent overflow-hidden">
        <div className="text-center max-w-full px-4">
          <div className="mb-6 hidden md:block">
            <TerminalAnimation className="text-muted" />
          </div>
          <h1 className="mb-6 select-none text-2xl font-bold tracking-tight text-balance md:hidden text-muted">
            autopilot
          </h1>
          <p className="text-sm text-pretty text-secondary">
            Select a workspace from the sidebar to start
          </p>
          <button
            onClick={handleAddRepository}
            className="mt-6 px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 mx-auto bg-accent-primary text-bg-primary hover:bg-accent-hover"
          >
            <PackagePlus className="w-4 h-4" />
            Add Repository
          </button>
          <div className="mt-6 text-xs space-y-1 text-tertiary">
            <p>
              <kbd className="px-2 py-1 rounded bg-tertiary text-secondary">
                ⌘D
              </kbd>{" "}
              New terminal
            </p>
            <p>
              <kbd className="px-2 py-1 rounded bg-tertiary text-secondary">
                ⌘W
              </kbd>{" "}
              Close terminal
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative">
      {allWorktreePaths.map((worktreePath) => {
        const worktreeData = terminalsByWorktree[worktreePath];
        const isCurrentWorktree = selectedWorktree?.path === worktreePath;
        const worktreeTerminals = worktreeData.terminals;

        if (!isCurrentWorktree) return null;
        if (worktreeTerminals.length === 0) return null;

        const terminalCount = worktreeTerminals.length;
        const cols = terminalCount;
        const rows = 1;

        return (
          <div
            key={worktreePath}
            className="absolute inset-0 grid gap-[1px]"
            style={{
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gridTemplateRows: `repeat(${rows}, 1fr)`,
              visibility: "visible",
              zIndex: 1,
            }}
          >
            {worktreeTerminals.map((terminal, index) => (
              <div
                key={terminal.id}
                className={`min-w-0 min-h-0 bg-transparent overflow-hidden relative ${index > 0 ? "border-l border-border" : ""}`}
              >
                <Terminal
                  ref={(handle) => {
                    if (handle) {
                      terminalRefs.current.set(terminal.id, handle);
                    } else {
                      terminalRefs.current.delete(terminal.id);
                    }
                  }}
                  terminalId={terminal.id}
                  isActive={
                    isCurrentWorktree && activeTerminalId === terminal.id
                  }
                  isVisible={isCurrentWorktree}
                  onFocus={() => setActiveTerminal(terminal.id)}
                />
                {searchOpenIds.has(terminal.id) && isCurrentWorktree && (
                  <TerminalSearchBar
                    terminalHandle={
                      terminalRefs.current.get(terminal.id) ?? null
                    }
                    onClose={() =>
                      setSearchOpenIds((prev) => {
                        const next = new Set(prev);
                        next.delete(terminal.id);
                        return next;
                      })
                    }
                  />
                )}
              </div>
            ))}
          </div>
        );
      })}

      {(!selectedWorktree || terminals.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center bg-transparent z-10 overflow-hidden">
          <div className="text-center max-w-full px-4">
            <div className="mb-6 hidden md:block">
              <TerminalAnimation className="text-muted" />
            </div>
            <h1 className="mb-6 select-none text-2xl font-bold tracking-tight text-balance md:hidden text-muted">
              autopilot
            </h1>
            <p className="text-sm text-pretty text-secondary">
              Select a workspace from the sidebar to start
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
