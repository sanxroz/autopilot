import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import type { ISearchOptions } from "@xterm/addon-search";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import "@xterm/xterm/css/xterm.css";
import { useTheme } from "../hooks/useTheme";
import { getTheme, subscribeTheme } from "../theme";
import { observeResize } from "../utils/sharedResizeObserver";

interface Props {
  terminalId: string;
  isActive: boolean;
  isVisible: boolean;
  onFocus: () => void;
}

export interface TerminalHandle {
  findNext: (query: string, opts?: ISearchOptions) => boolean;
  findPrevious: (query: string, opts?: ISearchOptions) => boolean;
  clearSearch: () => void;
  onDidChangeResults: (cb: (e: { resultIndex: number; resultCount: number }) => void) => { dispose: () => void } | undefined;
  focus: () => void;
}

export const Terminal = forwardRef<TerminalHandle, Props>(function Terminal({ terminalId, isActive, isVisible, onFocus }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const prevVisibleRef = useRef(isVisible);
  const isVisibleRef = useRef(isVisible);
  const theme = useTheme();

  useImperativeHandle(ref, () => ({
    findNext: (query: string, opts?: ISearchOptions) => {
      return searchAddonRef.current?.findNext(query, opts) ?? false;
    },
    findPrevious: (query: string, opts?: ISearchOptions) => {
      return searchAddonRef.current?.findPrevious(query, opts) ?? false;
    },
    clearSearch: () => {
      searchAddonRef.current?.clearDecorations();
    },
    onDidChangeResults: (cb: (e: { resultIndex: number; resultCount: number }) => void) => {
      return searchAddonRef.current?.onDidChangeResults(cb);
    },
    focus: () => {
      terminalRef.current?.focus();
    },
  }));

  // Keep ref in sync with prop to avoid stale closure in resize observer
  isVisibleRef.current = isVisible;

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
      fontFamily: '"SF Mono", ui-monospace, Menlo, Monaco, "Courier New", monospace',
      scrollback: 10000,
      allowTransparency: true,
      // Required for SearchAddon decorations — registerDecoration is experimental in xterm v6
      allowProposedApi: true,
      theme: {
        background: theme.terminal.background,
        foreground: theme.terminal.foreground,
        cursor: theme.terminal.cursor,
        cursorAccent: theme.terminal.cursorAccent,
        selectionBackground: theme.terminal.selectionBackground,
        black: theme.terminal.black,
        red: theme.terminal.red,
        green: theme.terminal.green,
        yellow: theme.terminal.yellow,
        blue: theme.terminal.blue,
        magenta: theme.terminal.magenta,
        cyan: theme.terminal.cyan,
        white: theme.terminal.white,
        brightBlack: theme.terminal.brightBlack,
        brightRed: theme.terminal.brightRed,
        brightGreen: theme.terminal.brightGreen,
        brightYellow: theme.terminal.brightYellow,
        brightBlue: theme.terminal.brightBlue,
        brightMagenta: theme.terminal.brightMagenta,
        brightCyan: theme.terminal.brightCyan,
        brightWhite: theme.terminal.brightWhite,
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);

    term.open(containerRef.current);

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    setTimeout(() => {
      if (isVisibleRef.current) {
        fit();
      }
    }, 50);

    term.onData((data) => {
      invoke("write_to_terminal", { terminalId, data }).catch(console.error);
    });

    // Handle OSC 10/11 queries for foreground/background color detection
    // TUI apps like opencode send these to detect dark/light mode
    
    // Convert hex color to xterm RGB format: rgb:RRRR/GGGG/BBBB
    const hexToXtermRgb = (hex: string): string => {
      const value = hex.startsWith("#") ? hex.slice(1) : hex;
      const normalized = value.length === 3
        ? value.split("").map((char) => `${char}${char}`).join("")
        : value;
      const r = parseInt(normalized.slice(0, 2), 16);
      const g = parseInt(normalized.slice(2, 4), 16);
      const b = parseInt(normalized.slice(4, 6), 16);
      // xterm uses 16-bit color values (0000-ffff)
      const r16 = (r << 8 | r).toString(16).padStart(4, '0');
      const g16 = (g << 8 | g).toString(16).padStart(4, '0');
      const b16 = (b << 8 | b).toString(16).padStart(4, '0');
      return `rgb:${r16}/${g16}/${b16}`;
    };

    // OSC 10: query/set foreground color
    term.parser.registerOscHandler(10, (data) => {
      if (data === '?') {
        const t = getTheme();
        const fgColor = t.terminal.foreground;
        const response = `\x1b]10;${hexToXtermRgb(fgColor)}\x1b\\`;
        invoke("write_to_terminal", { terminalId, data: response }).catch(console.error);
      }
      return true;
    });

    // OSC 11: query/set background color  
    term.parser.registerOscHandler(11, (data) => {
      if (data === '?') {
        const bgColor = getTheme().bg.primary;
        const response = `\x1b]11;${hexToXtermRgb(bgColor)}\x1b\\`;
        invoke("write_to_terminal", { terminalId, data: response }).catch(console.error);
      }
      return true;
    });

    const unlisten = listen<string>(
      `terminal-output-${terminalId}`,
      (event) => {
        term.write(event.payload);
      }
    );

    const unlistenClose = listen<void>(`terminal-closed-${terminalId}`, () => {
      term.write("\r\n\x1b[31m[Process exited]\x1b[0m\r\n");
    });

    const unobserve = observeResize(containerRef.current, () => {
      if (isVisibleRef.current) {
        requestAnimationFrame(fit);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
      unlistenClose.then((fn) => fn());
      unobserve();
      term.dispose();
    };
  }, [terminalId]);

  useEffect(() => {
    const wasHidden = !prevVisibleRef.current;
    const isNowVisible = isVisible;
    prevVisibleRef.current = isVisible;

    if (!wasHidden || !isNowVisible) return;
    if (!terminalRef.current) return;

    const frameId = requestAnimationFrame(() => {
      if (!terminalRef.current) return;
      fit();
      terminalRef.current.refresh(0, terminalRef.current.rows - 1);
      terminalRef.current.scrollToBottom();
    });

    return () => cancelAnimationFrame(frameId);
  }, [isVisible, fit]);

  useEffect(() => {
    if (isActive && isVisible && terminalRef.current) {
      terminalRef.current.focus();
    }
  }, [isActive, isVisible]);

  useEffect(() => {
    const updateTerminalTheme = () => {
      if (!terminalRef.current) return;
      const t = getTheme();
      terminalRef.current.options.theme = {
        background: t.terminal.background,
        foreground: t.terminal.foreground,
        cursor: t.terminal.cursor,
        cursorAccent: t.terminal.cursorAccent,
        selectionBackground: t.terminal.selectionBackground,
        black: t.terminal.black,
        red: t.terminal.red,
        green: t.terminal.green,
        yellow: t.terminal.yellow,
        blue: t.terminal.blue,
        magenta: t.terminal.magenta,
        cyan: t.terminal.cyan,
        white: t.terminal.white,
        brightBlack: t.terminal.brightBlack,
        brightRed: t.terminal.brightRed,
        brightGreen: t.terminal.brightGreen,
        brightYellow: t.terminal.brightYellow,
        brightBlue: t.terminal.brightBlue,
        brightMagenta: t.terminal.brightMagenta,
        brightCyan: t.terminal.brightCyan,
        brightWhite: t.terminal.brightWhite,
      };
      requestAnimationFrame(() => {
        if (!terminalRef.current) return;
        fit();
        terminalRef.current.refresh(0, terminalRef.current.rows - 1);
      });
    };
    return subscribeTheme(updateTerminalTheme);
  }, []);

  return (
    <div
      ref={containerRef}
      onClick={onFocus}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onFocus();
        }
      }}
      role="region"
      tabIndex={0}
      aria-label={`Terminal ${terminalId}`}
      className="w-full h-full bg-transparent relative"
      style={{ padding: "4px", background: theme.terminal.surfaceBackground }}
    >
      {isActive && isVisible && (
        <div
          className="absolute top-0 left-0 w-1 h-4 rounded-br"
          style={{
            background: theme.semantic.info,
          }}
        />
      )}
    </div>
  );
});
