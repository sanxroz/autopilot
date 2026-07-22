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

const TERMINAL_SCROLLBACK_LINES = 2000;

interface Props {
  terminalId: string;
  isActive: boolean;
  onFocus: () => void;
}

export interface TerminalHandle {
  findNext: (query: string, opts?: ISearchOptions) => boolean;
  findPrevious: (query: string, opts?: ISearchOptions) => boolean;
  clearSearch: () => void;
  onDidChangeResults: (cb: (e: { resultIndex: number; resultCount: number }) => void) => { dispose: () => void } | undefined;
  focus: () => void;
}

interface TerminalOutput {
  readonly data: string;
  readonly sequence: number;
}

interface TerminalOutputSnapshot extends TerminalOutput {}

interface TerminalDimensions {
  readonly cols: number;
  readonly rows: number;
}

export const Terminal = forwardRef<TerminalHandle, Props>(function Terminal({ terminalId, isActive, onFocus }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const terminalDimensionsRef = useRef<TerminalDimensions | null>(null);
  const themeFrameRef = useRef<number | null>(null);
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

  const fit = useCallback(() => {
    if (!fitAddonRef.current || !containerRef.current) return null;
    try {
      const dimensions = fitAddonRef.current.proposeDimensions();
      if (!dimensions) return null;
      fitAddonRef.current.fit();
      return dimensions satisfies TerminalDimensions;
    } catch (error) {
      console.error("Fit error:", error);
      return null;
    }
  }, []);

  const resizeTerminal = useCallback(async () => {
    if (!fitAddonRef.current) return;
    const dimensions = fitAddonRef.current.proposeDimensions();
    if (!dimensions) return;
    if (
      terminalDimensionsRef.current?.cols === dimensions.cols &&
      terminalDimensionsRef.current?.rows === dimensions.rows
    ) {
      return;
    }

    fitAddonRef.current.fit();
    try {
      await invoke("resize_terminal", { terminalId, ...dimensions });
      terminalDimensionsRef.current = dimensions;
    } catch (error) {
      console.error("Terminal resize failed:", error);
    }
  }, [terminalId]);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"SF Mono", ui-monospace, Menlo, Monaco, "Courier New", monospace',
      scrollback: TERMINAL_SCROLLBACK_LINES,
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
    terminalDimensionsRef.current = null;

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
      if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
        console.error(`hexToXtermRgb: invalid hex color "${hex}"`);
        return "rgb:0000/0000/0000";
      }
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

    let disposed = false;
    let replayLoaded = false;
    let appliedSequence = 0;
    let unlistenOutput: (() => void) | null = null;
    const replayEvents: TerminalOutput[] = [];
    const outputQueue: TerminalOutput[] = [];
    let isWritingOutput = false;

    const flushOutputQueue = () => {
      if (isWritingOutput || disposed) return;

      const output = outputQueue.shift();
      if (!output) return;

      isWritingOutput = true;
      term.write(output.data, () => {
        isWritingOutput = false;
        void invoke("acknowledge_terminal_output", {
          terminalId,
          sequence: output.sequence,
        }).catch(console.error);
        flushOutputQueue();
      });
    };

    const appendOutput = (output: TerminalOutput) => {
      if (output.sequence <= appliedSequence) return;
      appliedSequence = output.sequence;
      outputQueue.push(output);
      flushOutputQueue();
    };

    void listen<TerminalOutput>(`terminal-output-${terminalId}`, (event) => {
      if (!replayLoaded) {
        replayEvents.push(event.payload);
        return;
      }
      appendOutput(event.payload);
    })
      .then(async (unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        unlistenOutput = unlisten;
        try {
          await invoke("attach_terminal_output", { terminalId });
          if (disposed) return;
          await resizeTerminal();
          if (disposed) return;
          const snapshot = await invoke<TerminalOutputSnapshot>(
            "get_terminal_output",
            { terminalId }
          );
          if (disposed) return;
          appliedSequence = snapshot.sequence;
          term.write(snapshot.data, () => {
            if (disposed) return;
            void invoke("acknowledge_terminal_output", {
              terminalId,
              sequence: snapshot.sequence,
            }).catch(console.error);
            replayLoaded = true;
            for (const output of replayEvents) {
              appendOutput(output);
            }
            replayEvents.length = 0;
            requestAnimationFrame(() => {
              if (!terminalRef.current) return;
              fit();
              terminalRef.current.refresh(0, terminalRef.current.rows - 1);
              terminalRef.current.scrollToBottom();
            });
          });
        } catch (error) {
          console.error("Failed to replay terminal output:", error);
          if (disposed) return;
          replayLoaded = true;
          for (const output of replayEvents) {
            appendOutput(output);
          }
          replayEvents.length = 0;
          requestAnimationFrame(() => {
            if (!terminalRef.current) return;
            fit();
            terminalRef.current.refresh(0, terminalRef.current.rows - 1);
            terminalRef.current.scrollToBottom();
          });
        }
      })
      .catch(console.error);

    const unlistenClose = listen<void>(`terminal-closed-${terminalId}`, () => {
      term.write("\r\n\x1b[31m[Process exited]\x1b[0m\r\n");
    });

    const unobserve = observeResize(containerRef.current, () => {
      requestAnimationFrame(() => {
        void resizeTerminal();
      });
    });

    return () => {
      disposed = true;
      void invoke("detach_terminal_output", { terminalId }).catch(console.error);
      unlistenOutput?.();
      unlistenClose.then((fn) => fn());
      outputQueue.length = 0;
      unobserve();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      terminalDimensionsRef.current = null;
    };
  }, [terminalId, resizeTerminal, fit]);

  useEffect(() => {
    if (isActive && terminalRef.current) {
      terminalRef.current.focus();
    }
  }, [isActive]);

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
      if (themeFrameRef.current !== null) {
        cancelAnimationFrame(themeFrameRef.current);
      }
      themeFrameRef.current = requestAnimationFrame(() => {
        themeFrameRef.current = null;
        if (!terminalRef.current) return;
        fit();
        terminalRef.current.refresh(0, terminalRef.current.rows - 1);
      });
    };
    const unsubscribe = subscribeTheme(updateTerminalTheme);
    return () => {
      unsubscribe();
      if (themeFrameRef.current !== null) {
        cancelAnimationFrame(themeFrameRef.current);
        themeFrameRef.current = null;
      }
    };
  }, [fit]);

  return (
    <div
      ref={containerRef}
      onClick={onFocus}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onFocus();
          terminalRef.current?.focus();
        }
      }}
      role="region"
      tabIndex={0}
      aria-label={`Terminal ${terminalId}`}
      className="w-full h-full min-w-0 min-h-0 overflow-hidden bg-transparent relative"
      style={{ padding: "4px", background: theme.terminal.surfaceBackground }}
    >
      {isActive && (
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
