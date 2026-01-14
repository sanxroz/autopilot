import { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import "@xterm/xterm/css/xterm.css";

interface Props {
  terminalId: string;
  isActive: boolean;
  isVisible: boolean;
  onFocus: () => void;
}

export function Terminal({ terminalId, isActive, isVisible, onFocus }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const prevVisibleRef = useRef(isVisible);

  const fit = useCallback(() => {
    if (fitAddonRef.current && containerRef.current) {
      try {
        fitAddonRef.current.fit();
        const dims = fitAddonRef.current.proposeDimensions();
        if (dims) {
          invoke("resize_terminal", {
            terminalId,
            cols: dims.cols,
            rows: dims.rows,
          }).catch(console.error);
        }
      } catch (e) {
        console.error("Fit error:", e);
      }
    }
  }, [terminalId]);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      allowTransparency: true,
      theme: {
        background: "rgba(0, 0, 0, 0)",
        foreground: "#e4e4e7",
        cursor: "#e4e4e7",
        cursorAccent: "#18181b",
        selectionBackground: "rgba(63, 63, 70, 0.7)",
        black: "#18181b",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#e4e4e7",
        brightBlack: "#52525b",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#facc15",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#fafafa",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    setTimeout(fit, 50);

    term.onData((data) => {
      invoke("write_to_terminal", { terminalId, data }).catch(console.error);
    });

    const unlisten = listen<{ terminal_id: string; data: string }>(
      "terminal-output",
      (event) => {
        if (event.payload.terminal_id === terminalId) {
          term.write(event.payload.data);
        }
      }
    );

    const unlistenClose = listen<string>("terminal-closed", (event) => {
      if (event.payload === terminalId) {
        term.write("\r\n\x1b[31m[Process exited]\x1b[0m\r\n");
      }
    });

    resizeObserverRef.current = new ResizeObserver(() => {
      if (isVisible) {
        requestAnimationFrame(fit);
      }
    });
    resizeObserverRef.current.observe(containerRef.current);

    return () => {
      unlisten.then((fn) => fn());
      unlistenClose.then((fn) => fn());
      resizeObserverRef.current?.disconnect();
      term.dispose();
    };
  }, [terminalId]);

  useEffect(() => {
    const wasHidden = !prevVisibleRef.current;
    const isNowVisible = isVisible;
    prevVisibleRef.current = isVisible;

    if (wasHidden && isNowVisible && terminalRef.current) {
      setTimeout(() => {
        fit();
        if (terminalRef.current) {
          terminalRef.current.refresh(0, terminalRef.current.rows - 1);
          terminalRef.current.scrollToBottom();
        }
      }, 100);
    }
  }, [isVisible, fit]);

  useEffect(() => {
    if (isActive && isVisible && terminalRef.current) {
      terminalRef.current.focus();
    }
  }, [isActive, isVisible]);

  return (
    <div
      ref={containerRef}
      onClick={onFocus}
      className={`w-full h-full bg-transparent ${
        isActive && isVisible ? "ring-1 ring-zinc-500/50" : ""
      }`}
      style={{ padding: "4px" }}
    />
  );
}
