import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Terminal } from "./Terminal";
import type { TerminalHandle } from "./Terminal";
import { TerminalSearchBar } from "./TerminalSearchBar";
import { getThemeMode } from "../theme";

interface CaptainTerminalGridProps {
  open: boolean;
  repositoryRoot: string;
  onClose: () => void;
}

export function CaptainTerminalGrid({
  open,
  repositoryRoot,
  onClose,
}: CaptainTerminalGridProps) {
  const [terminalIds, setTerminalIds] = useState<string[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [searchOpenIds, setSearchOpenIds] = useState<Set<string>>(new Set());
  const [starting, setStarting] = useState(false);
  const terminalRefs = useRef<Map<string, TerminalHandle>>(new Map());
  const terminalRootRef = useRef<string | null>(null);
  const hasStartedRef = useRef(false);

  const addTerminal = useCallback(async () => {
    const cwd = terminalRootRef.current ?? repositoryRoot;
    if (!cwd || starting) return;

    setStarting(true);
    hasStartedRef.current = true;
    try {
      const result = await invoke<{ terminal_id: string }>("spawn_terminal", {
        cwd,
        cols: 80,
        rows: 24,
        isDarkMode: getThemeMode() === "dark",
      });
      terminalRootRef.current = cwd;
      setTerminalIds((current) => [...current, result.terminal_id]);
      setActiveTerminalId(result.terminal_id);
    } catch (error) {
      console.error("Failed to start captain terminal:", error);
    } finally {
      setStarting(false);
    }
  }, [repositoryRoot, starting]);

  const removeTerminal = useCallback((terminalId: string) => {
    void invoke("close_terminal", { terminalId }).catch(console.error);

    const next = terminalIds.filter((id) => id !== terminalId);
    setTerminalIds(next);
    if (activeTerminalId === terminalId) {
      setActiveTerminalId(next[next.length - 1] ?? null);
    }

    if (next.length === 0) {
      terminalRootRef.current = null;
      hasStartedRef.current = false;
      onClose();
    }
  }, [activeTerminalId, onClose, terminalIds]);

  useEffect(() => {
    if (!open) {
      hasStartedRef.current = false;
    } else if (!hasStartedRef.current && terminalIds.length === 0) {
      void addTerminal();
    }
  }, [addTerminal, open, terminalIds.length]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !open || !(event.metaKey || event.ctrlKey)) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case "d":
          event.preventDefault();
          void addTerminal();
          break;
        case "w":
          event.preventDefault();
          if (activeTerminalId) removeTerminal(activeTerminalId);
          break;
        case "f":
          event.preventDefault();
          if (activeTerminalId) {
            setSearchOpenIds((current) => new Set(current).add(activeTerminalId));
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTerminalId, addTerminal, open, removeTerminal]);

  if (!open) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 top-[35px] z-20 min-h-0 bg-primary">
      <div className="relative h-full min-h-0">
        {terminalIds.length > 0 ? (
          <div
            className="absolute inset-0 grid gap-px"
            style={{ gridTemplateColumns: `repeat(${terminalIds.length}, minmax(0, 1fr))` }}
          >
            {terminalIds.map((terminalId, index) => (
              <div
                key={terminalId}
                className={`relative min-h-0 min-w-0 overflow-hidden ${index > 0 ? "border-l border-border" : ""}`}
              >
                <Terminal
                  ref={(handle) => {
                    if (handle) {
                      terminalRefs.current.set(terminalId, handle);
                    } else {
                      terminalRefs.current.delete(terminalId);
                    }
                  }}
                  terminalId={terminalId}
                  isActive={activeTerminalId === terminalId}
                  onFocus={() => setActiveTerminalId(terminalId)}
                />
                {searchOpenIds.has(terminalId) && (
                  <TerminalSearchBar
                    terminalHandle={terminalRefs.current.get(terminalId) ?? null}
                    onClose={() => {
                      setSearchOpenIds((current) => {
                        const next = new Set(current);
                        next.delete(terminalId);
                        return next;
                      });
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-secondary">
            {starting ? "Starting captain terminal…" : "No captain terminals"}
          </div>
        )}
      </div>
    </div>
  );
}
