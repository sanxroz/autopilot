import { useCallback, useEffect, useState, useRef } from "react";
import {
  GitPullRequest,
  GitMerge,
  ChevronDown,
  RefreshCw,
  ExternalLink,
  ListTodo,
  MessageCircle,
  Eye,
  type LucideIcon,
  Diff,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useTheme } from "../../hooks/useTheme";
import { usePRStatusForBranch } from "../../hooks/usePRStatus";
import { useAppStore } from "../../store";
import { ChecksTab } from "./ChecksTab";
import { ReviewTab } from "./ReviewTab";
import { CommentsTab } from "./CommentsTab";
import { DiffTab } from "./DiffTab";
import { Tabs, TabsList, TabsTrigger } from "../ui/segmented-control";
import * as Tooltip from "../ui/tooltip";
import type { CreatePRResult } from "../../types/github";

interface RightPanelProps {
  worktreePath: string | null;
  onClose: () => void;
}

type TabId = "checks" | "comments" | "code-review" | "changes";

const MIN_WIDTH = 300;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 450;

export function RightPanel({ worktreePath }: RightPanelProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("checks");
  const [showPRDropdown, setShowPRDropdown] = useState(false);
  const [isCreatingPR, setIsCreatingPR] = useState(false);
  const [checksRefresh, setChecksRefresh] = useState<(() => void) | null>(null);
  const [commentsRefresh, setCommentsRefresh] = useState<(() => void) | null>(
    null,
  );

  const selectedWorktree = useAppStore((state) => state.selectedWorktree);
  const repositories = useAppStore((state) => state.repositories);

  const repoPath =
    repositories.find((r) => r.worktrees.some((w) => w.path === worktreePath))
      ?.info.path ?? null;

  const branch = selectedWorktree?.branch ?? null;
  const prStatus = usePRStatusForBranch(repoPath ?? "", branch);

  const refresh = useCallback(() => {}, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const containerRight = window.innerWidth;
      const newWidth = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, containerRight - e.clientX),
      );
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const handleCreatePR = async (draft: boolean) => {
    if (!repoPath) return;

    setIsCreatingPR(true);
    setShowPRDropdown(false);

    try {
      await invoke<CreatePRResult>("create_pr", {
        repoPath,
        title: branch || "New PR",
        body: null,
        base: null,
        draft,
      });
      refresh();
    } catch (e) {
      console.error("Failed to create PR:", e);
    } finally {
      setIsCreatingPR(false);
    }
  };

  const getChecksColor = () => {
    if (!prStatus) return theme.text.secondary;
    if (prStatus.checks_status === "failure") return "#EF4444";
    if (prStatus.checks_status === "pending") return "#F59E0B";
    if (prStatus.checks_status === "success") return "#22C55E";
    return theme.text.secondary;
  };

  const isReadyToMerge =
    prStatus &&
    !prStatus.merged &&
    prStatus.state === "open" &&
    prStatus.checks_status === "success" &&
    (prStatus.review_decision === "APPROVED" ||
      prStatus.review_decision === null);

  const diffViewMode = useAppStore((state) => state.diffViewMode);
  const prevDiffViewModeRef = useRef(diffViewMode);

  const showChangesTab = diffViewMode === "sidebar";

  useEffect(() => {
    const prevMode = prevDiffViewModeRef.current;
    prevDiffViewModeRef.current = diffViewMode;

    if (diffViewMode === 'sidebar' && prevMode === 'overlay') {
      setActiveTab("changes");
    } else if (diffViewMode === 'overlay' && prevMode === 'sidebar' && activeTab === "changes") {
      setActiveTab("checks");
    }
  }, [diffViewMode, activeTab]);

  const tabs: { id: TabId; label: string; icon: LucideIcon; color?: string }[] =
    [
      {
        id: "checks",
        label: "Checks",
        icon: ListTodo,
        color: getChecksColor(),
      },
      { id: "comments", label: "Comments", icon: MessageCircle },
      { id: "code-review", label: "Code Review", icon: Eye },
      ...(showChangesTab
        ? [{ id: "changes" as TabId, label: "Changes", icon: Diff }]
        : []),
    ];

  return (
    <div
      className="relative flex flex-col h-full select-none"
      style={{
        width: `${width}px`,
        minWidth: `${MIN_WIDTH}px`,
        maxWidth: `${MAX_WIDTH}px`,
        borderLeft: `1px solid ${theme.border.default}`,
      }}
    >
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 left-0 w-1 h-full cursor-col-resize z-10 transition-colors"
        style={{
          backgroundColor: isResizing ? theme.border.strong : "transparent",
        }}
      />

      <div
        className="flex items-center gap-1 px-3"
        style={{
          height: "35px",
          minHeight: "35px",
        }}
      >
        {prStatus && (
          <a
            href={prStatus.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors mr-2"
            style={{
              color: theme.text.secondary,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = theme.bg.hover;
              e.currentTarget.style.color = theme.text.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = theme.text.secondary;
            }}
            title={prStatus.title}
          >
            <span className="font-medium">#{prStatus.number}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}

        <Tooltip.Provider delayDuration={300}>
          <Tabs
            value={activeTab}
            onValueChange={(value: string) => setActiveTab(value as TabId)}
          >
            <TabsList
              containerBgColor={theme.bg.primary}
              floatingBgColor={theme.bg.tertiary}
            >
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <Tooltip.Root key={tab.id}>
                    <Tooltip.Trigger asChild>
                      <TabsTrigger
                        value={tab.id}
                        style={{
                          color: tab.color
                            ? tab.color
                            : isActive
                              ? theme.text.primary
                              : theme.text.secondary,
                        }}
                      >
                        <tab.icon className="w-3.5 h-3.5" />
                      </TabsTrigger>
                    </Tooltip.Trigger>
                    <Tooltip.Content side="bottom" size="small">
                      {tab.label}
                    </Tooltip.Content>
                  </Tooltip.Root>
                );
              })}
            </TabsList>
          </Tabs>
        </Tooltip.Provider>

        <div className="flex-1" />

        {((activeTab === "checks" && checksRefresh) ||
          (activeTab === "comments" && commentsRefresh)) && (
          <button
            onClick={activeTab === "checks" ? checksRefresh! : commentsRefresh!}
            className="p-1 rounded transition-colors mr-2"
            style={{ color: theme.text.tertiary }}
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}

        {isReadyToMerge && (
          <button
            onClick={() => window.open(prStatus.url, "_blank")}
            className="px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
            style={{
              background: "#22C55E",
              color: "white",
            }}
          >
            <GitMerge className="w-3.5 h-3.5" />
            Merge
          </button>
        )}

        {!prStatus && (
          <div className="relative">
            <button
              onClick={() => setShowPRDropdown(!showPRDropdown)}
              disabled={isCreatingPR || !repoPath}
              className="px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors"
              style={{
                background: theme.bg.tertiary,
                color: theme.text.primary,
                opacity: isCreatingPR || !repoPath ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isCreatingPR && repoPath) {
                  e.currentTarget.style.background = theme.bg.hover;
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = theme.bg.tertiary;
              }}
            >
              {isCreatingPR ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <GitPullRequest className="w-3.5 h-3.5" />
                  Create PR
                  <ChevronDown className="w-3 h-3" />
                </>
              )}
            </button>

            {showPRDropdown && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowPRDropdown(false)}
                />
                <div
                  className="absolute right-0 top-full mt-1 rounded shadow-lg z-20 py-1 min-w-[140px]"
                  style={{
                    background: theme.bg.secondary,
                    border: `1px solid ${theme.border.default}`,
                  }}
                >
                  <button
                    onClick={() => handleCreatePR(false)}
                    className="w-full px-3 py-1.5 text-left text-xs transition-colors"
                    style={{ color: theme.text.primary }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = theme.bg.hover;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    Create PR
                  </button>
                  <button
                    onClick={() => handleCreatePR(true)}
                    className="w-full px-3 py-1.5 text-left text-xs transition-colors"
                    style={{ color: theme.text.secondary }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = theme.bg.hover;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    Create draft PR
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === "checks" && (
          <ChecksTab
            repoPath={repoPath}
            prNumber={prStatus?.number ?? null}
            prUrl={prStatus?.url ?? null}
            onRefreshReady={setChecksRefresh}
          />
        )}
        {activeTab === "comments" && (
          <CommentsTab
            repoPath={repoPath}
            prNumber={prStatus?.number ?? null}
            onRefreshReady={setCommentsRefresh}
          />
        )}
        {activeTab === "code-review" && <ReviewTab repoPath={worktreePath} />}
        {activeTab === "changes" && <DiffTab worktreePath={worktreePath} />}
      </div>
    </div>
  );
}
