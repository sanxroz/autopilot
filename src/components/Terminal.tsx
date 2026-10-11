import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { WebLinksAddon } from "@xterm/addon-web-links";
import type { ISearchOptions } from "@xterm/addon-search";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import "@xterm/xterm/css/xterm.css";
import { useTheme } from "../hooks/useTheme";
import { getTheme, subscribeTheme } from "../theme";
import { observeResize } from "../utils/sharedResizeObserver";
import { useAppStore } from "../store";
import { isLocalWebUrl } from "../lib/local-web-url";
import {
  isPanelResizing,
  PANEL_RESIZE_END_EVENT,
} from "../utils/panelResize";

const TERMINAL_SCROLLBACK_LINES = 2000;
const MOUSE_PROTOCOL_MODES = new Set([1005, 1006, 1015, 1016]);

interface CachedTerminalState {
  readonly data: string;
  readonly sequence: number;
  readonly cols: number;
  readonly rows: number;
  readonly mouseProtocolMode: number | null;
}

// Hidden terminals keep a serialized screen so switching back is instant; cap it so closed sessions can't pile up.
const TERMINAL_STATE_CACHE_MAX_ENTRIES = 20;
const terminalStateCache = new Map<string, CachedTerminalState>();

function cacheTerminalState(terminalId: string, state: CachedTerminalState) {
  terminalStateCache.delete(terminalId);
  terminalStateCache.set(terminalId, state);
  for (const oldestId of terminalStateCache.keys()) {
    if (terminalStateCache.size <= TERMINAL_STATE_CACHE_MAX_ENTRIES) break;
    terminalStateCache.delete(oldestId);
  }
}

type AppTheme = ReturnType<typeof getTheme>;

function buildXtermTheme(t: AppTheme) {
  return {
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
}

// Convert hex color to xterm RGB format: rgb:RRRR/GGGG/BBBB
function hexToXtermRgb(hex: string): string {
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
}

function openTerminalLink(_event: MouseEvent, uri: string) {
  if (isLocalWebUrl(uri)) {
    useAppStore.getState().openBrowserTab(uri);
    return;
  }
  void openUrl(uri).catch((error) => {
    console.error(`Failed to open terminal link "${uri}":`, error);
  });
}

interface TerminalDimensions {
  readonly cols: number;
  readonly rows: number;
}

/** A live xterm that outlives its React mount so switching sessions doesn't rebuild and replay it. */
interface PooledTerminal {
  readonly terminalId: string;
  readonly term: XTerm;
  readonly fitAddon: FitAddon;
  readonly searchAddon: SearchAddon;
  readonly serializeAddon: SerializeAddon;
  /** Serialized screen still to be written into a freshly created xterm. */
  restoreState: CachedTerminalState | undefined;
  /** Highest output sequence handed to `term.write`; the next attach replays only what comes after it. */
  writtenSequence: number;
  /** Highest output sequence xterm has finished parsing. */
  renderedSequence: number;
  mouseProtocolMode: number | null;
  dimensions: TerminalDimensions | null;
  mounted: boolean;
  closed: boolean;
  readonly unlistenClosed: Promise<() => void>;
}

// Hidden terminals are detached from the DOM and from backend output, so they cost memory but no CPU.
const HIDDEN_TERMINAL_POOL_MAX_ENTRIES = 8;
const hiddenTerminals = new Map<string, PooledTerminal>();

function disposePooledTerminal(entry: PooledTerminal) {
  hiddenTerminals.delete(entry.terminalId);
  void entry.unlistenClosed.then((unlisten) => unlisten());
  entry.term.dispose();
}

function createPooledTerminal(terminalId: string): PooledTerminal {
  const restoreState = terminalStateCache.get(terminalId);
  const term = new XTerm({
    ...(restoreState ? { cols: restoreState.cols, rows: restoreState.rows } : {}),
    cursorBlink: true,
    fontSize: 13,
    fontFamily: '"SF Mono", ui-monospace, Menlo, Monaco, "Courier New", monospace',
    scrollback: TERMINAL_SCROLLBACK_LINES,
    allowTransparency: true,
    linkHandler: { activate: openTerminalLink },
    // Required for SearchAddon decorations — registerDecoration is experimental in xterm v6
    allowProposedApi: true,
    theme: buildXtermTheme(getTheme()),
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  const searchAddon = new SearchAddon();
  term.loadAddon(searchAddon);
  const serializeAddon = new SerializeAddon();
  term.loadAddon(serializeAddon);
  term.loadAddon(new WebLinksAddon(openTerminalLink));

  const entry: PooledTerminal = {
    terminalId,
    term,
    fitAddon,
    searchAddon,
    serializeAddon,
    restoreState,
    writtenSequence: 0,
    renderedSequence: 0,
    mouseProtocolMode: restoreState?.mouseProtocolMode ?? null,
    dimensions: null,
    mounted: false,
    closed: false,
    unlistenClosed: listen<void>(`terminal-closed-${terminalId}`, () => {
      entry.closed = true;
      terminalStateCache.delete(terminalId);
      if (entry.mounted) {
        term.write("\r\n\x1b[31m[Process exited]\x1b[0m\r\n");
      } else {
        disposePooledTerminal(entry);
      }
    }),
  };

  term.onData((data) => {
    invoke("write_to_terminal", { terminalId, data }).catch(console.error);
  });

  // Handle OSC 10/11 queries for foreground/background color detection
  // TUI apps like opencode send these to detect dark/light mode
  term.parser.registerOscHandler(10, (data) => {
    if (data === '?') {
      const response = `\x1b]10;${hexToXtermRgb(getTheme().terminal.foreground)}\x1b\\`;
      invoke("write_to_terminal", { terminalId, data: response }).catch(console.error);
    }
    return true;
  });
  term.parser.registerOscHandler(11, (data) => {
    if (data === '?') {
      const response = `\x1b]11;${hexToXtermRgb(getTheme().bg.primary)}\x1b\\`;
      invoke("write_to_terminal", { terminalId, data: response }).catch(console.error);
    }
    return true;
  });

  // SerializeAddon restores mouse tracking, but not the negotiated mouse encoding Amp expects.
  const updateMouseProtocolMode = (enabled: boolean) => (params: (number | number[])[]) => {
    const modes = params.flat().filter((mode) => MOUSE_PROTOCOL_MODES.has(mode));
    if (enabled && modes.length > 0) {
      entry.mouseProtocolMode = modes[modes.length - 1] ?? null;
    } else if (!enabled && entry.mouseProtocolMode !== null && modes.includes(entry.mouseProtocolMode)) {
      entry.mouseProtocolMode = null;
    }
    return false;
  };
  term.parser.registerCsiHandler({ prefix: "?", final: "h" }, updateMouseProtocolMode(true));
  term.parser.registerCsiHandler({ prefix: "?", final: "l" }, updateMouseProtocolMode(false));

  return entry;
}

function acquirePooledTerminal(terminalId: string, container: HTMLElement): PooledTerminal {
  const pooled = hiddenTerminals.get(terminalId);
  hiddenTerminals.delete(terminalId);
  const entry = pooled ?? createPooledTerminal(terminalId);
  if (entry.term.element) {
    container.appendChild(entry.term.element);
    // The theme may have changed while it was hidden.
    entry.term.options.theme = buildXtermTheme(getTheme());
  } else {
    entry.term.open(container);
  }
  entry.mounted = true;
  return entry;
}

function releasePooledTerminal(entry: PooledTerminal) {
  entry.mounted = false;
  entry.term.blur();
  entry.term.element?.remove();
  if (entry.closed) {
    disposePooledTerminal(entry);
    return;
  }
  // The same session can be mounted twice (e.g. in two grids); keep only the latest copy.
  const previous = hiddenTerminals.get(entry.terminalId);
  if (previous && previous !== entry) disposePooledTerminal(previous);
  hiddenTerminals.set(entry.terminalId, entry);
  for (const oldest of hiddenTerminals.values()) {
    if (hiddenTerminals.size <= HIDDEN_TERMINAL_POOL_MAX_ENTRIES) break;
    // Fall back to the cheaper serialized snapshot for terminals that haven't been viewed recently.
    cacheTerminalState(oldest.terminalId, oldest.restoreState ?? {
      data: oldest.serializeAddon.serialize({ scrollback: TERMINAL_SCROLLBACK_LINES }),
      sequence: oldest.renderedSequence,
      cols: oldest.term.cols,
      rows: oldest.term.rows,
      mouseProtocolMode: oldest.mouseProtocolMode,
    });
    disposePooledTerminal(oldest);
  }
}

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

interface TerminalOutputSnapshot extends TerminalOutput {
  readonly truncated: boolean;
}

export const Terminal = forwardRef<TerminalHandle, Props>(function Terminal({ terminalId, isActive, onFocus }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const terminalDimensionsRef = useRef<TerminalDimensions | null>(null);
  const themeFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
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

    const entry = acquirePooledTerminal(terminalId, containerRef.current);
    const { term } = entry;
    terminalRef.current = term;
    fitAddonRef.current = entry.fitAddon;
    searchAddonRef.current = entry.searchAddon;
    terminalDimensionsRef.current = entry.dimensions;

    let disposed = false;
    let replayLoaded = false;
    let appliedSequence = 0;
    let attachmentId: number | null = null;
    let unlistenOutput: (() => void) | null = null;
    const replayEvents: TerminalOutput[] = [];
    const outputQueue: TerminalOutput[] = [];
    let isWritingOutput = false;

    const writeOutput = (data: string, sequence: number, onWritten?: () => void) => {
      entry.writtenSequence = Math.max(entry.writtenSequence, sequence);
      term.write(data, () => {
        entry.renderedSequence = Math.max(entry.renderedSequence, sequence);
        onWritten?.();
      });
    };

    const flushOutputQueue = () => {
      if (isWritingOutput || disposed) return;

      // Write everything queued in one pass so bursts cost one parse and one acknowledgement.
      const outputs = outputQueue.splice(0);
      const sequence = outputs[outputs.length - 1]?.sequence;
      if (sequence === undefined) return;

      isWritingOutput = true;
      writeOutput(outputs.map((output) => output.data).join(""), sequence, () => {
        isWritingOutput = false;
        void invoke("acknowledge_terminal_output", {
          terminalId,
          sequence,
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

    const finishReplay = () => {
      replayLoaded = true;
      for (const output of replayEvents) {
        appendOutput(output);
      }
      replayEvents.length = 0;
      requestAnimationFrame(() => {
        if (disposed) return;
        fit();
        term.refresh(0, term.rows - 1);
        term.scrollToBottom();
      });
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
          let terminalCompleted = false;
          try {
            attachmentId = await invoke<number>("attach_terminal_output", {
              terminalId,
            });
          } catch {
            terminalCompleted = true;
          }
          if (disposed) {
            if (attachmentId !== null) {
              void invoke("detach_terminal_output", {
                terminalId,
                attachmentId,
              }).catch(console.error);
            }
            return;
          }
          // A pooled terminal already shows everything up to writtenSequence; only fetch what it missed.
          const restoreState = entry.restoreState;
          const afterSequence = restoreState?.sequence ?? (entry.writtenSequence || null);
          let snapshot = await invoke<TerminalOutputSnapshot>(
            "get_terminal_output",
            { terminalId, afterSequence },
          );
          if (disposed) return;
          if (snapshot.truncated) {
            terminalStateCache.delete(terminalId);
            entry.restoreState = undefined;
            if (!restoreState) term.reset();
            snapshot = await invoke<TerminalOutputSnapshot>(
              "get_terminal_output",
              { terminalId, afterSequence: null },
            );
            if (disposed) return;
          } else if (restoreState) {
            entry.restoreState = undefined;
            const mouseProtocol = restoreState.mouseProtocolMode === null
              ? ""
              : `\x1b[?${restoreState.mouseProtocolMode}h`;
            writeOutput(restoreState.data + mouseProtocol, restoreState.sequence);
          }
          await resizeTerminal();
          if (disposed) return;
          appliedSequence = snapshot.sequence;
          writeOutput(snapshot.data, snapshot.sequence, () => {
            if (disposed) return;
            if (!terminalCompleted) {
              void invoke("acknowledge_terminal_output", {
                terminalId,
                sequence: snapshot.sequence,
              }).catch(console.error);
            } else if (!entry.closed) {
              entry.closed = true;
              terminalStateCache.delete(terminalId);
              term.write("\r\n\x1b[31m[Process exited]\x1b[0m\r\n");
            }
            finishReplay();
          });
        } catch (error) {
          console.error("Failed to replay terminal output:", error);
          if (disposed) return;
          finishReplay();
        }
      })
      .catch(console.error);

    const scheduleResize = () => {
      if (resizeFrameRef.current !== null) return;
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        void resizeTerminal();
      });
    };
    const unobserve = observeResize(containerRef.current, () => {
      if (!isPanelResizing()) scheduleResize();
    });
    window.addEventListener(PANEL_RESIZE_END_EVENT, scheduleResize);

    return () => {
      disposed = true;
      if (attachmentId !== null) {
        void invoke("detach_terminal_output", {
          terminalId,
          attachmentId,
        }).catch(console.error);
      }
      unlistenOutput?.();
      outputQueue.length = 0;
      unobserve();
      window.removeEventListener(PANEL_RESIZE_END_EVENT, scheduleResize);
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      entry.dimensions = terminalDimensionsRef.current;
      releasePooledTerminal(entry);
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
      terminalRef.current.options.theme = buildXtermTheme(t);
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
      data-terminal-id={terminalId}
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
    </div>
  );
});
