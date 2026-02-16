import { useState, useRef, useEffect, useCallback } from "react";
import {
  ChevronUp,
  ChevronDown,
  X,
  CaseSensitive,
  Regex,
  WholeWord,
} from "lucide-react";
import { cn } from "../utils/cn";
import { useTheme } from "../hooks/useTheme";
import type { TerminalHandle } from "./Terminal";
import type { ISearchOptions } from "@xterm/addon-search";

interface TerminalSearchBarProps {
  terminalHandle: TerminalHandle | null;
  onClose: () => void;
}

export function TerminalSearchBar({
  terminalHandle,
  onClose,
}: TerminalSearchBarProps) {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [resultIndex, setResultIndex] = useState(-1);
  const [resultCount, setResultCount] = useState(0);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!terminalHandle) return;

    const disposable = terminalHandle.onDidChangeResults(
      ({ resultIndex: idx, resultCount: count }) => {
        setResultIndex(idx);
        setResultCount(count);
      }
    );

    return () => disposable?.dispose();
  }, [terminalHandle]);

  const getSearchDecorations = useCallback(() => {
    return {
      matchBackground: "#785000",
      matchBorder: "#F59E0B",
      matchOverviewRuler: "#F59E0B",
      activeMatchBackground: "#F59E0B",
      activeMatchBorder: "#FBBF24",
      activeMatchColorOverviewRuler: "#FBBF24",
    };
  }, []);

  const getSearchOptions = useCallback(
    (incremental = false): ISearchOptions => ({
      caseSensitive,
      regex,
      wholeWord,
      incremental,
      decorations: getSearchDecorations(),
    }),
    [caseSensitive, regex, wholeWord, getSearchDecorations]
  );

  useEffect(() => {
    if (!terminalHandle) return;

    if (query) {
      terminalHandle.findNext(query, getSearchOptions(true));
    } else {
      terminalHandle.clearSearch();
      setResultIndex(-1);
      setResultCount(0);
    }
  }, [query, caseSensitive, regex, wholeWord, terminalHandle, getSearchOptions]);

  const handleFindNext = useCallback(() => {
    if (query && terminalHandle) {
      terminalHandle.findNext(query, getSearchOptions());
    }
  }, [query, terminalHandle, getSearchOptions]);

  const handleFindPrevious = useCallback(() => {
    if (query && terminalHandle) {
      terminalHandle.findPrevious(query, getSearchOptions());
    }
  }, [query, terminalHandle, getSearchOptions]);

  const handleClose = useCallback(() => {
    terminalHandle?.clearSearch();
    terminalHandle?.focus();
    onClose();
  }, [terminalHandle, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) {
          handleFindPrevious();
        } else {
          handleFindNext();
        }
      }
    },
    [handleClose, handleFindNext, handleFindPrevious]
  );

  const hasQuery = query.length > 0;
  const noResults = hasQuery && resultCount === 0;

  return (
    <div
      className="absolute top-2 right-3 z-10 flex items-center gap-1 rounded-lg px-2 py-1 shadow-lg border"
      style={{
        background: theme.bg.secondary,
        borderColor: noResults ? theme.semantic.error : theme.border.default,
      }}
      onKeyDown={handleKeyDown}
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find..."
        spellCheck={false}
        className="bg-transparent outline-none text-xs w-36 placeholder:text-tertiary"
        style={{ color: theme.text.primary }}
      />

      {hasQuery && (
        <span
          className="text-[10px] tabular-nums whitespace-nowrap mr-0.5 select-none"
          style={{ color: noResults ? theme.semantic.error : theme.text.tertiary }}
        >
          {noResults
            ? "No results"
            : `${resultIndex + 1} of ${resultCount}`}
        </span>
      )}

      <ToggleButton
        active={caseSensitive}
        onClick={() => setCaseSensitive((v) => !v)}
        title="Match Case"
        theme={theme}
      >
        <CaseSensitive className="w-3.5 h-3.5" />
      </ToggleButton>

      <ToggleButton
        active={wholeWord}
        onClick={() => setWholeWord((v) => !v)}
        title="Match Whole Word"
        theme={theme}
      >
        <WholeWord className="w-3.5 h-3.5" />
      </ToggleButton>

      <ToggleButton
        active={regex}
        onClick={() => setRegex((v) => !v)}
        title="Use Regular Expression"
        theme={theme}
      >
        <Regex className="w-3.5 h-3.5" />
      </ToggleButton>

      <div
        className="w-px h-4 mx-0.5"
        style={{ background: theme.border.subtle }}
      />

      <IconButton
        onClick={handleFindPrevious}
        disabled={!hasQuery || noResults}
        title="Previous Match (Shift+Enter)"
        theme={theme}
      >
        <ChevronUp className="w-3.5 h-3.5" />
      </IconButton>

      <IconButton
        onClick={handleFindNext}
        disabled={!hasQuery || noResults}
        title="Next Match (Enter)"
        theme={theme}
      >
        <ChevronDown className="w-3.5 h-3.5" />
      </IconButton>

      <IconButton
        onClick={handleClose}
        title="Close (Esc)"
        theme={theme}
      >
        <X className="w-3.5 h-3.5" />
      </IconButton>
    </div>
  );
}

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  title: string;
  theme: ReturnType<typeof useTheme>;
  children: React.ReactNode;
}

function ToggleButton({
  active,
  onClick,
  title,
  theme,
  children,
}: ToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "p-1 rounded transition-colors",
        active ? "bg-active" : "bg-transparent hover:bg-hover"
      )}
      style={{
        color: active ? theme.text.primary : theme.text.tertiary,
      }}
    >
      {children}
    </button>
  );
}

interface IconButtonProps {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  theme: ReturnType<typeof useTheme>;
  children: React.ReactNode;
}

function IconButton({
  onClick,
  disabled,
  title,
  theme,
  children,
}: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "p-1 rounded transition-colors",
        disabled
          ? "opacity-30 cursor-default"
          : "hover:bg-hover"
      )}
      style={{
        color: disabled ? theme.text.muted : theme.text.tertiary,
      }}
    >
      {children}
    </button>
  );
}
