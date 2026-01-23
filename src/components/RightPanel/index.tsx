import { useCallback, useEffect, useState, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  GitPullRequest,
  GitMerge,
  ChevronDown,
  Loader,
  ExternalLink,
  ListTodo,
  MessageCircle,
  type LucideIcon,
  Diff,
  Play,
  GitBranch,
  MessageSquare,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useTheme } from "../../hooks/useTheme";
import { usePRStatusForBranch } from "../../hooks/usePRStatus";
import { useAppStore } from "../../store";

import { ChecksTab } from "./ChecksTab";
import { CommentsTab } from "./CommentsTab";
import { DiffTab } from "./DiffTab";
import { Tabs, TabsList, TabsTrigger } from "../ui/segmented-control";
import * as Tooltip from "../ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import type { CreatePRResult } from "../../types/github";

interface RightPanelProps {
  worktreePath: string | null;
  onClose: () => void;
}

type TabId = "checks" | "comments" | "changes";

const MIN_WIDTH = 300;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 450;

type ReviewMode = "uncommitted" | "base" | "custom";

export function RightPanel({ worktreePath }: RightPanelProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("checks");
  const [showPRDropdown, setShowPRDropdown] = useState(false);
  const [isCreatingPR, setIsCreatingPR] = useState(false);
  const [showCustomPromptInput, setShowCustomPromptInput] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const customPromptInputRef = useRef<HTMLTextAreaElement>(null);

  const selectedWorktree = useAppStore((state) => state.selectedWorktree);
  const repositories = useAppStore((state) => state.repositories);
  const addTerminalWithCommand = useAppStore((state) => state.addTerminalWithCommand);

  const repoPath =
    repositories.find((r) => r.worktrees.some((w) => w.path === worktreePath))
      ?.info.path ?? null;

  const branch = selectedWorktree?.branch ?? null;
  const prStatus = usePRStatusForBranch(repoPath ?? "", branch);

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
    } catch (e) {
      console.error("Failed to create PR:", e);
    } finally {
      setIsCreatingPR(false);
    }
  };

  const getChecksColor = () => {
    return theme.text.secondary;
  };

  const handleRunReview = useCallback(
    (mode: ReviewMode, prompt?: string) => {
      setShowCustomPromptInput(false);

      let command = "cubic review";
      if (mode === "base") {
        command = "cubic review --base";
      } else if (mode === "custom" && prompt) {
        // Use single quotes to prevent shell expansion ($(...), backticks, variables)
        // Escape single quotes by ending the string, adding escaped quote, starting new string
        const escapedPrompt = prompt.replace(/'/g, "'\\''");
        command = `cubic review --prompt '${escapedPrompt}'`;
      }

      addTerminalWithCommand(command);
    },
    [addTerminalWithCommand],
  );

  const handleCustomPromptSubmit = useCallback(() => {
    if (customPrompt.trim()) {
      handleRunReview("custom", customPrompt.trim());
      setCustomPrompt("");
    }
  }, [customPrompt, handleRunReview]);

  const handleCustomPromptCancel = useCallback(() => {
    setShowCustomPromptInput(false);
    setCustomPrompt("");
  }, []);

  useEffect(() => {
    if (showCustomPromptInput && customPromptInputRef.current) {
      customPromptInputRef.current.focus();
    }
  }, [showCustomPromptInput]);

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
      ...(showChangesTab
        ? [{ id: "changes" as TabId, label: "Changes", icon: Diff }]
        : []),
    ];

  return (
    <motion.div
      initial={reducedMotion ? false : { x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { x: 400, opacity: 0 }}
      transition={{
        duration: reducedMotion ? 0 : 0.25,
        ease: [0.215, 0.61, 0.355, 1], // cubic-out
      }}
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
            <ExternalLink className="w-3.5 h-3.5" />
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

        {worktreePath && (
        <DropdownMenu
          onOpenChange={(open) => {
            if (!open) {
              setShowCustomPromptInput(false);
              setCustomPrompt("");
            }
          }}
        >
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-medium transition-colors hover:bg-opacity-80"
              style={{
                color: theme.text.primary,
              }}
            >
              <Play className="w-3.5 h-3.5" />
              Review
              <ChevronDown className="w-3.5 h-3.5 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <motion.div
              animate={{ width: showCustomPromptInput ? 280 : "auto" }}
              transition={{
                duration: reducedMotion ? 0 : 0.2,
                ease: [0.215, 0.61, 0.355, 1], // cubic-out
              }}
              style={{ overflow: "hidden" }}
            >
              <AnimatePresence mode="wait">
                {showCustomPromptInput ? (
                <motion.div
                  key="custom-prompt"
                  initial={reducedMotion ? false : { opacity: 0, scale: 0.95, y: -8, x: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, x: -12 }}
                  transition={{
                    duration: reducedMotion ? 0 : 0.2,
                    ease: [0.215, 0.61, 0.355, 1], // cubic-out
                  }}
                  className="p-1"
                >
                  <textarea
                    ref={customPromptInputRef}
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleCustomPromptSubmit();
                      }
                      if (e.key === "Escape") {
                        handleCustomPromptCancel();
                      }
                    }}
                    placeholder="Enter review prompt..."
                    className="w-full px-2 py-1.5 text-sm rounded outline-none resize-none"
                    style={{
                      background: "transparent",
                      minHeight: "56px",
                    }}
                    autoFocus
                  />
                  <div className="flex items-center justify-end gap-1 px-1 pb-0.5">
                    <button
                      onClick={handleCustomPromptCancel}
                      className="px-2 py-1 text-xs rounded transition-colors"
                      style={{ color: theme.text.tertiary }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCustomPromptSubmit}
                      disabled={!customPrompt.trim()}
                      className="px-2 py-1 text-xs rounded transition-colors flex items-center gap-1"
                      style={{
                        background: customPrompt.trim() ? theme.accent.primary : "transparent",
                        color: customPrompt.trim() ? "white" : theme.text.muted,
                      }}
                    >
                      <Play className="w-3 h-3" />
                      Run
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="menu-items"
                  initial={reducedMotion ? false : { opacity: 0, scale: 0.95, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, x: -12 }}
                  transition={{
                    duration: reducedMotion ? 0 : 0.2,
                    ease: [0.215, 0.61, 0.355, 1], // cubic-out
                  }}
                >
                  <DropdownMenuItem onClick={() => handleRunReview("uncommitted")}>
                    <Play className="w-3 h-3" />
                    <span>Uncommitted changes</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleRunReview("base")}>
                    <GitBranch className="w-3 h-3" />
                    <span>Against base branch</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      setShowCustomPromptInput(true);
                    }}
                  >
                    <MessageSquare className="w-3 h-3" />
                    <span>With custom prompt...</span>
                  </DropdownMenuItem>
                </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </DropdownMenuContent>
        </DropdownMenu>
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
                <Loader className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <GitPullRequest className="w-3.5 h-3.5" />
                  Create PR
                  <ChevronDown className="w-3.5 h-3.5" />
                </>
              )}
            </button>

            {showPRDropdown && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowPRDropdown(false)}
                />
                <motion.div
                  initial={reducedMotion ? false : { opacity: 0, scale: 0.95, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -8 }}
                  transition={{
                    duration: reducedMotion ? 0 : 0.15,
                    ease: [0.215, 0.61, 0.355, 1],
                  }}
                  className="absolute right-0 top-full mt-1 rounded shadow-lg z-20 py-1 min-w-[140px]"
                  style={{
                    background: theme.bg.secondary,
                    border: `1px solid ${theme.border.default}`,
                    transformOrigin: "top right",
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
                </motion.div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          {activeTab === "checks" && (
            <motion.div
              key="checks"
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
              transition={{
                duration: reducedMotion ? 0 : 0.15,
                ease: [0.215, 0.61, 0.355, 1],
              }}
              className="h-full overflow-hidden flex flex-col"
            >
              <ChecksTab
                repoPath={repoPath}
                prNumber={prStatus?.number ?? null}
                prUrl={prStatus?.url ?? null}
                prStatus={prStatus}
              />
            </motion.div>
          )}
          {activeTab === "comments" && (
            <motion.div
              key="comments"
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
              transition={{
                duration: reducedMotion ? 0 : 0.15,
                ease: [0.215, 0.61, 0.355, 1],
              }}
              className="h-full overflow-hidden flex flex-col"
            >
              <CommentsTab
                repoPath={repoPath}
                prNumber={prStatus?.number ?? null}
                prStatus={prStatus}
              />
            </motion.div>
          )}

          {activeTab === "changes" && (
            <motion.div
              key="changes"
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
              transition={{
                duration: reducedMotion ? 0 : 0.15,
                ease: [0.215, 0.61, 0.355, 1],
              }}
              className="h-full overflow-hidden flex flex-col"
            >
              <DiffTab worktreePath={worktreePath} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
