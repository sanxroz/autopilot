import { useState } from "react";
import { ArrowLeft, ArrowRight, Copy, ExternalLink, MoreHorizontal, RefreshCw, Star, TerminalSquare } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { isLocalWebUrl } from "../lib/local-web-url";
import { useAppStore } from "../store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const BOOKMARKS_KEY = "autopilot-browser-bookmarks";

function loadBookmarks(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter(isLocalWebUrl) : [];
  } catch {
    return [];
  }
}

interface BrowserPaneProps {
  initialUrl: string;
  onNavigate: (url: string) => void;
}

export function BrowserPane({ initialUrl, onNavigate }: BrowserPaneProps) {
  const [url, setUrl] = useState(initialUrl);
  const [address, setAddress] = useState(initialUrl);
  const [reloadKey, setReloadKey] = useState(0);
  const [history, setHistory] = useState([initialUrl]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [bookmarks, setBookmarks] = useState(loadBookmarks);
  const [zoom, setZoom] = useState(1);

  const navigateTo = (nextUrl: string, remember = true) => {
    const normalizedUrl = new URL(nextUrl).href;
    setUrl(normalizedUrl);
    setAddress(normalizedUrl);
    onNavigate(normalizedUrl);
    if (remember) {
      setHistory((current) => [...current.slice(0, historyIndex + 1), normalizedUrl]);
      setHistoryIndex((index) => index + 1);
    }
  };

  const navigate = () => {
    const nextUrl = /^https?:\/\//i.test(address) ? address : `http://${address}`;
    if (!isLocalWebUrl(nextUrl)) {
      toast.error("Only localhost URLs can open inside Autopilot");
      setAddress(url);
      return;
    }
    navigateTo(nextUrl);
  };

  const moveThroughHistory = (nextIndex: number) => {
    setHistoryIndex(nextIndex);
    navigateTo(history[nextIndex], false);
  };

  const toggleBookmark = () => {
    const nextBookmarks = bookmarks.includes(url)
      ? bookmarks.filter((bookmark) => bookmark !== url)
      : [...bookmarks, url];
    setBookmarks(nextBookmarks);
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(nextBookmarks));
  };

  const openTerminal = () => {
    const store = useAppStore.getState();
    const terminalTab = store.currentTerminalTabs.find((tab) => !tab.browserUrl);
    if (terminalTab) store.setActiveTerminalTab(terminalTab.id);
  };

  const buttonClass = "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-hover hover:text-primary active:scale-[0.97] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 disabled:pointer-events-none disabled:opacity-35";

  return (
    <section className="absolute inset-0 z-10 flex min-h-0 flex-col bg-primary" aria-label="Local browser">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border-subtle bg-secondary/50 px-2">
        <button type="button" onClick={() => moveThroughHistory(historyIndex - 1)} disabled={historyIndex === 0} className={buttonClass} aria-label="Go back" title="Go back">
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <button type="button" onClick={() => moveThroughHistory(historyIndex + 1)} disabled={historyIndex === history.length - 1} className={buttonClass} aria-label="Go forward" title="Go forward">
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => setReloadKey((key) => key + 1)}
          className={buttonClass}
          aria-label="Reload page"
          title="Reload page"
        >
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <form
          className="min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            navigate();
          }}
        >
          <input
            type="url"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            spellCheck={false}
            autoComplete="off"
            aria-label="Local URL"
            className="h-7 w-full rounded-md border border-transparent bg-transparent px-2 text-xs text-tertiary outline-none transition-[background-color,border-color,color] hover:text-secondary focus:border-border-subtle focus:bg-primary focus:text-primary"
          />
        </form>
        <button type="button" onClick={toggleBookmark} className={buttonClass} aria-label={bookmarks.includes(url) ? "Remove bookmark" : "Bookmark page"} title={bookmarks.includes(url) ? "Remove bookmark" : "Bookmark page"}>
          <Star className={`h-3.5 w-3.5 ${bookmarks.includes(url) ? "fill-current text-accent-primary" : ""}`} strokeWidth={1.75} />
        </button>
        <button type="button" onClick={openTerminal} className={buttonClass} aria-label="Open terminal" title="Open terminal">
          <TerminalSquare className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => void openUrl(url)}
          className={buttonClass}
          aria-label="Open in system browser"
          title="Open in system browser"
        >
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={buttonClass} aria-label="Browser options" title="Browser options">
              <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(url).then(() => toast.success("URL copied"))}>
              <Copy className="h-4 w-4" /> Copy current URL
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setReloadKey((key) => key + 1)}>
              <RefreshCw className="h-4 w-4" /> Reload page
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className="flex items-center justify-between px-2 py-1.5 text-sm text-secondary">
              <span>Zoom</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))} className="h-6 w-6 rounded hover:bg-hover" aria-label="Zoom out">−</button>
                <span className="w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={() => setZoom((value) => Math.min(2, value + 0.1))} className="h-6 w-6 rounded hover:bg-hover" aria-label="Zoom in">+</button>
              </div>
            </div>
            {bookmarks.length > 0 && <DropdownMenuSeparator />}
            {bookmarks.map((bookmark) => (
              <DropdownMenuItem key={bookmark} onSelect={() => navigateTo(bookmark)} className="truncate">
                <Star className="h-4 w-4 fill-current" /> {new URL(bookmark).host}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-white">
        <iframe
          key={`${url}-${reloadKey}`}
          src={url}
          title={`Browser preview of ${url}`}
          className="block border-0 bg-white"
          style={{
            width: `${100 / zoom}%`,
            height: `${100 / zoom}%`,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
          }}
        />
      </div>
    </section>
  );
}
