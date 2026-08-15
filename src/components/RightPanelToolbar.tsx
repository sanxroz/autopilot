import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  ChevronDown,
  ExternalLink,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Loader,
  NotepadText,
  AppWindow,
  type LucideIcon,
} from "lucide-react";
import { useMergePR } from "../hooks/useMergePR";
import { usePRStatusForWorktree } from "../hooks/usePRStatus";
import { getOpenWithIconSources } from "../lib/open-with";
import { useAppStore } from "../store";
import type { InstalledIde } from "../types";
import { cn } from "../utils/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export type RightPanelTabId = "git" | "pr" | "notes";

interface RightPanelToolbarProps {
  worktreePath: string | null;
  activeTab: RightPanelTabId;
  onActiveTabChange: (tab: RightPanelTabId) => void;
}

function OpenWithIcon({ ide }: { readonly ide: InstalledIde }) {
  const sources = useMemo(() => getOpenWithIconSources(ide), [ide]);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [sources]);

  const activeSrc = sources[sourceIndex];

  if (!activeSrc) {
    return <AppWindow className="h-3.5 w-3.5 shrink-0 text-tertiary" />;
  }

  return (
    <img
      src={activeSrc}
      alt=""
      className="h-[18px] w-[18px] shrink-0 object-contain"
      loading="eager"
      onError={() => setSourceIndex((currentIndex) => currentIndex + 1)}
    />
  );
}

function isReadyToMerge(
  prStatus: NonNullable<ReturnType<typeof usePRStatusForWorktree>>,
): boolean {
  return (
    !prStatus.merged &&
    !prStatus.draft &&
    prStatus.state === "open" &&
    prStatus.checks_status === "success" &&
    (prStatus.review_decision === "APPROVED" || prStatus.review_decision === null)
  );
}

export function RightPanelToolbar({
  worktreePath,
  activeTab,
  onActiveTabChange,
}: RightPanelToolbarProps) {
  const repositories = useAppStore((state) => state.repositories);
  const installedIdes = useAppStore((state) => state.installedIdes);
  const isLoadingIdes = useAppStore((state) => state.isLoadingInstalledIdes);
  const personalNotes = useAppStore((state) =>
    state.getSidebarNotesMarkdown(worktreePath),
  );
  const [hasCurrentWorkNotes, setHasCurrentWorkNotes] = useState(false);
  const [openingIdeId, setOpeningIdeId] = useState<string | null>(null);

  const repoPath = useMemo(
    () =>
      repositories.find((repo) =>
        repo.worktrees.some((worktree) => worktree.path === worktreePath),
      )?.info.path ?? null,
    [repositories, worktreePath],
  );
  const prStatus = usePRStatusForWorktree(worktreePath);
  const { isMerging, hasMerged, handleMerge } = useMergePR({
    repoPath,
    prNumber: prStatus?.number ?? null,
  });

  const handleOpenWith = useCallback(
    async (ideId: string) => {
      if (!worktreePath) return;

      setOpeningIdeId(ideId);
      try {
        await invoke("open_worktree_in_ide", { worktreePath, ideId });
      } catch (error) {
        console.error(`Failed to open worktree in ${ideId}:`, error);
      } finally {
        setOpeningIdeId(null);
      }
    },
    [worktreePath],
  );

  useEffect(() => {
    if (!prStatus && activeTab === "pr") {
      onActiveTabChange("git");
    }
  }, [activeTab, onActiveTabChange, prStatus]);

  useEffect(() => {
    let cancelled = false;
    let refreshInFlight = false;
    let refreshNeeded = false;

    setHasCurrentWorkNotes(false);
    if (!worktreePath) return;

    const refreshCurrentWorkNotes = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      if (refreshInFlight) {
        refreshNeeded = true;
        return;
      }

      refreshInFlight = true;
      try {
        const hasContent = await invoke<boolean>("has_autopilot_context", {
          worktreePath,
        });
        if (!cancelled) setHasCurrentWorkNotes(hasContent);
      } catch {
        // Preserve the last known state when the file cannot be checked.
      } finally {
        refreshInFlight = false;
        if (refreshNeeded) {
          refreshNeeded = false;
          void refreshCurrentWorkNotes();
        }
      }
    };

    const unlistenContextChanged = listen<{ worktree_path: string }>(
      "autopilot-context-changed",
      (event) => {
        if (event.payload.worktree_path === worktreePath) {
          void refreshCurrentWorkNotes();
        }
      },
    );
    void refreshCurrentWorkNotes();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshCurrentWorkNotes();
      }
    };

    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      cancelled = true;
      unlistenContextChanged.then((unlisten) => unlisten());
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [worktreePath]);

  const tabs: Array<{ id: RightPanelTabId; label: string; icon: LucideIcon }> = [
    { id: "git", label: "Git changes", icon: GitBranch },
    ...(prStatus
      ? [{ id: "pr" as const, label: "Pull request", icon: GitPullRequest }]
      : []),
    { id: "notes", label: "Notes", icon: NotepadText },
  ];
  const hasNotes = hasCurrentWorkNotes || personalNotes.trim().length > 0;
  const canMergePR = prStatus ? isReadyToMerge(prStatus) : false;
  const displayedTab = activeTab;

  return (
    <div className="flex min-w-0 shrink items-center gap-1">
      <div
        role="tablist"
        aria-label="Right panel"
        className="flex items-center gap-0.5"
      >
        {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={displayedTab === tab.id}
              aria-label={
                tab.id === "notes" && hasNotes ? "Notes, has content" : tab.label
              }
              title={
                tab.id === "notes" && hasNotes ? "Notes (has content)" : tab.label
              }
              onClick={() => onActiveTabChange(tab.id)}
              className={cn(
                "relative flex h-6 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1",
                displayedTab === tab.id
                  ? "text-primary"
                  : "text-muted hover:bg-hover hover:text-secondary",
              )}
            >
              <tab.icon className="h-4 w-4" strokeWidth={1.5} />
              {tab.id === "notes" && hasNotes && (
                <span
                  className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent-primary ring-1 ring-[var(--color-bg-primary)]"
                  aria-hidden="true"
                />
              )}
            </button>
        ))}
      </div>

      {worktreePath && (
        <div
          className={cn(
            "flex h-6 items-center overflow-hidden",
            prStatus && "rounded-md border border-border-subtle",
          )}
        >
          {prStatus && (
            <a
              href={prStatus.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-full items-center gap-1 border-r border-border-subtle px-2.5 font-mono text-[11px] tabular-nums text-secondary transition-colors hover:bg-hover hover:text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px]"
              title={`Open #${prStatus.number} in GitHub`}
              aria-label={`Open pull request #${prStatus.number} in GitHub`}
            >
              PR #{prStatus.number}
              <ExternalLink className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
            </a>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-shortcut-action="open-with"
                className={cn(
                  "flex h-full items-center gap-1.5 px-2 text-[11px] font-medium text-secondary transition-colors hover:bg-hover hover:text-primary",
                  prStatus ? "w-7 justify-center px-0" : "rounded-md",
                )}
                aria-label="Open workspace with another application"
                title="Open workspace with another application"
              >
                {!prStatus && (
                  <span>
                    {isLoadingIdes && installedIdes.length === 0
                      ? "Detecting…"
                      : "Open with"}
                  </span>
                )}
                <ChevronDown className="h-3 w-3" strokeWidth={1.5} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isLoadingIdes && installedIdes.length === 0 ? (
                <DropdownMenuItem disabled className="gap-2">
                  <Loader className="h-3.5 w-3.5 animate-spin" />
                  Detecting editors…
                </DropdownMenuItem>
              ) : installedIdes.length > 0 ? (
                installedIdes.map((ide) => (
                  <DropdownMenuItem
                    key={ide.id}
                    className="gap-2"
                    disabled={openingIdeId !== null}
                    onClick={() => void handleOpenWith(ide.id)}
                  >
                    {openingIdeId === ide.id ? (
                      <Loader className="h-[18px] w-[18px] animate-spin" />
                    ) : (
                      <OpenWithIcon ide={ide} />
                    )}
                    {openingIdeId === ide.id ? `Opening ${ide.name}…` : ide.name}
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem disabled>No supported editors found</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {canMergePR && !hasMerged && (
        <button
          type="button"
          onClick={handleMerge}
          disabled={isMerging}
          className="flex h-6 items-center gap-1 rounded-md bg-semantic-success px-2.5 text-[11px] font-medium text-white transition-colors hover:bg-semantic-success/90 active:scale-[0.97] disabled:cursor-wait disabled:opacity-50"
          title={isMerging ? "Merging pull request…" : "Merge pull request"}
          aria-label={isMerging ? "Merging pull request" : "Merge pull request"}
        >
          {isMerging ? (
            <Loader className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
          ) : (
            <GitMerge className="h-3.5 w-3.5" strokeWidth={1.5} />
          )}
          {isMerging ? "Merging…" : "Merge"}
        </button>
      )}
    </div>
  );
}
