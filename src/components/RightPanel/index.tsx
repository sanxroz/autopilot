import { useCallback, useEffect, useState } from "react";
import {
  GitPullRequest,
  GitMerge,
  ChevronDown,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useTheme } from "../../hooks/useTheme";
import { useCodeReview } from "../../hooks/useCodeReview";
import { usePRStatusForBranch } from "../../hooks/usePRStatus";
import { useAppStore } from "../../store";
import { ChangesTab } from "./ChangesTab";
import { ChecksTab } from "./ChecksTab";
import { ReviewTab } from "./ReviewTab";
import type { CreatePRResult } from "../../types/github";

interface RightPanelProps {
  worktreePath: string | null;
  onClose: () => void;
}

type TabId = "changes" | "checks" | "review";

const MIN_WIDTH = 300;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 450;

export function RightPanel({ worktreePath }: RightPanelProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("changes");
  const [showPRDropdown, setShowPRDropdown] = useState(false);
  const [isCreatingPR, setIsCreatingPR] = useState(false);

  const selectedWorktree = useAppStore((state) => state.selectedWorktree);
  const repositories = useAppStore((state) => state.repositories);

  const repoPath =
    repositories.find((r) =>
      r.worktrees.some((w) => w.path === worktreePath)
    )?.info.path ?? null;

  const branch = selectedWorktree?.branch ?? null;
  const prStatus = usePRStatusForBranch(repoPath ?? "", branch);

  const {
    changedFiles,
    selectedFile,
    fileDiff,
    isLoading,
    error,
    selectFile,
    refresh,
  } = useCodeReview(worktreePath);

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
        Math.max(MIN_WIDTH, containerRight - e.clientX)
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
    (prStatus.review_decision === "APPROVED" || prStatus.review_decision === null);

  const tabs: { id: TabId; label: string; count?: number; color?: string }[] = [
    { id: "changes", label: "Changes", count: changedFiles.length },
    { id: "checks", label: "Checks", color: getChecksColor() },
    { id: "review", label: "Review" },
  ];

  return (
    <div
      className="relative flex flex-col h-full select-none"
      style={{
        width: `${width}px`,
        minWidth: `${MIN_WIDTH}px`,
        maxWidth: `${MAX_WIDTH}px`,
        background: theme.bg.secondary,
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
            <span className='font-medium'>#{prStatus.number}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}

        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-2 py-1 rounded text-sm transition-colors flex items-center gap-1.5"
              style={{
                background: isActive ? theme.bg.active : "transparent",
                color: tab.color
                  ? isActive
                    ? tab.color
                    : tab.color
                  : isActive
                  ? theme.text.primary
                  : theme.text.secondary,
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = theme.bg.hover;
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{
                    background: theme.bg.tertiary,
                    color: theme.text.tertiary,
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}

        <div className="flex-1" />

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

      {error && (
        <div
          className="px-3 py-2 text-xs border-b"
          style={{
            background: theme.semantic.errorMuted,
            borderColor: theme.border.default,
            color: theme.semantic.error,
          }}
        >
          {error}
        </div>
      )}

      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === "changes" && (
          <ChangesTab
            changedFiles={changedFiles}
            selectedFile={selectedFile}
            fileDiff={fileDiff}
            isLoading={isLoading}
            onSelectFile={selectFile}
          />
        )}
        {activeTab === "checks" && (
          <ChecksTab
            repoPath={repoPath}
            prNumber={prStatus?.number ?? null}
            prUrl={prStatus?.url ?? null}
          />
        )}
        {activeTab === "review" && <ReviewTab repoPath={worktreePath} />}
      </div>
    </div>
  );
}
