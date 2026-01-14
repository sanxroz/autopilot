import { useEffect, useCallback } from 'react';
import { useAppStore } from '../store';
import { Terminal } from './Terminal';

export function TerminalGrid() {
  const selectedWorktree = useAppStore((state) => state.selectedWorktree);
  const terminals = useAppStore((state) => state.currentTerminals);
  const activeTerminalId = useAppStore((state) => state.currentActiveTerminalId);
  const terminalsByWorktree = useAppStore((state) => state.terminalsByWorktree);
  const setActiveTerminal = useAppStore((state) => state.setActiveTerminal);
  const addTerminal = useAppStore((state) => state.addTerminal);
  const removeTerminal = useAppStore((state) => state.removeTerminal);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      
      if (isMeta && e.key === 'd' && !e.shiftKey) {
        e.preventDefault();
        addTerminal();
      }

      if (isMeta && e.key === 'w') {
        e.preventDefault();
        if (activeTerminalId) {
          removeTerminal(activeTerminalId);
        }
      }
    },
    [activeTerminalId, addTerminal, removeTerminal]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const allWorktreePaths = Object.keys(terminalsByWorktree);

  if (!selectedWorktree && allWorktreePaths.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-transparent">
        <div className="text-center">
          <h1 className="text-6xl font-bold text-zinc-600/50 tracking-wider mb-4 font-mono">
            AUTOPILOT
          </h1>
          <p className="text-zinc-600 text-sm">
            Select a workspace from the sidebar to start
          </p>
          <div className="mt-8 text-zinc-600 text-xs space-y-1">
            <p>
              <kbd className="px-2 py-1 bg-zinc-800/50 rounded text-zinc-400">⌘D</kbd> New terminal
            </p>
            <p>
              <kbd className="px-2 py-1 bg-zinc-800/50 rounded text-zinc-400">⌘W</kbd> Close terminal
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


        if (worktreeTerminals.length === 0) return null;

        const terminalCount = worktreeTerminals.length;
        const cols = Math.ceil(Math.sqrt(terminalCount));
        const rows = Math.ceil(terminalCount / cols);

        return (
          <div
            key={worktreePath}
            className="absolute inset-0 grid gap-[1px] bg-transparent p-[1px]"
            style={{
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gridTemplateRows: `repeat(${rows}, 1fr)`,
              visibility: isCurrentWorktree ? 'visible' : 'hidden',
              zIndex: isCurrentWorktree ? 1 : 0,
            }}
          >
            {worktreeTerminals.map((terminal) => (
              <div key={terminal.id} className="min-w-0 min-h-0 bg-transparent overflow-hidden">
                <Terminal
                  terminalId={terminal.id}
                  isActive={isCurrentWorktree && activeTerminalId === terminal.id}
                  isVisible={isCurrentWorktree}
                  onFocus={() => setActiveTerminal(terminal.id)}
                />
              </div>
            ))}
          </div>
        );
      })}

      {(!selectedWorktree || terminals.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center bg-transparent z-10">
          <div className="text-center">
            <h1 className="text-6xl font-bold text-zinc-600/50 tracking-wider mb-4 font-mono">
              AUTOPILOT
            </h1>
            <p className="text-zinc-600 text-sm">
              Select a workspace from the sidebar to start
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
