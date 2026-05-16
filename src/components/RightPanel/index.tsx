import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ChevronDown,
  Diff,
  GitBranch,
  MessageSquare,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";
import { useAppStore } from "../../store";
import { cn } from "../../utils/cn";

import { DiffTab } from "./DiffTab";
import { GitTab } from "./GitTab";
import { Tabs, TabsList, TabsTrigger } from "../ui/segmented-control";
import * as Tooltip from "../ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface RightPanelProps {
  worktreePath: string | null;
}

type TabId = "changes" | "git";

const MIN_WIDTH = 300;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 450;

type ReviewMode = "uncommitted" | "base" | "custom";

export function RightPanel({ worktreePath }: RightPanelProps) {
  const reducedMotion = useReducedMotion();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(DEFAULT_WIDTH);
  const diffViewMode = useAppStore((state) => state.diffViewMode);
  const addTerminalWithCommand = useAppStore((state) => state.addTerminalWithCommand);
  const [activeTab, setActiveTab] = useState<TabId>(
    diffViewMode === "sidebar" ? "changes" : "git",
  );
  const [showCustomPromptInput, setShowCustomPromptInput] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const customPromptInputRef = useRef<HTMLTextAreaElement>(null);
  const prevDiffViewModeRef = useRef(diffViewMode);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      widthRef.current = width;
      setIsResizing(true);
    },
    [width],
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const containerRight = window.innerWidth;
      const newWidth = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, containerRight - e.clientX),
      );
      widthRef.current = newWidth;
      if (containerRef.current) {
        containerRef.current.style.width = `${newWidth}px`;
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setWidth(widthRef.current);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const handleRunReview = useCallback(
    (mode: ReviewMode, prompt?: string) => {
      setShowCustomPromptInput(false);

      let command = "cubic review";
      if (mode === "base") {
        command = "cubic review --base";
      } else if (mode === "custom" && prompt) {
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

  const showChangesTab = diffViewMode === "sidebar";

  useEffect(() => {
    const prevMode = prevDiffViewModeRef.current;
    prevDiffViewModeRef.current = diffViewMode;

    if (!showChangesTab && activeTab === "changes") {
      setActiveTab("git");
      return;
    }

    if (showChangesTab && prevMode === "overlay") {
      setActiveTab("changes");
    }
  }, [activeTab, diffViewMode, showChangesTab]);

  const tabs: { id: TabId; label: string; icon: LucideIcon }[] = [
    ...(showChangesTab ? [{ id: "changes" as const, label: "Changes", icon: Diff }] : []),
    { id: "git", label: "Git", icon: GitBranch },
  ];

  return (
    <motion.div
      ref={containerRef}
      initial={reducedMotion ? false : { x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { x: 400, opacity: 0 }}
      transition={{
        duration: reducedMotion ? 0 : 0.25,
        ease: [0.215, 0.61, 0.355, 1],
      }}
      className="relative flex flex-col h-full select-none border-l border-border"
      style={{
        width: `${width}px`,
        minWidth: `${MIN_WIDTH}px`,
        maxWidth: `${MAX_WIDTH}px`,
      }}
    >
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          "absolute top-0 left-0 w-1 h-full cursor-col-resize z-10 transition-colors",
          isResizing ? "bg-border-strong" : "bg-transparent",
        )}
      />

      <div className="flex items-center gap-1 px-3 h-[35px] min-h-[35px]">
        <Tooltip.Provider delayDuration={300}>
          <Tabs
            value={activeTab}
            onValueChange={(value: string) => setActiveTab(value as TabId)}
          >
            <TabsList
              containerBgColor="var(--color-bg-primary)"
              floatingBgColor="var(--color-bg-tertiary)"
            >
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <Tooltip.Root key={tab.id}>
                    <Tooltip.Trigger asChild>
                      <TabsTrigger
                        value={tab.id}
                        className={isActive ? "text-primary" : "text-secondary"}
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
              <button className="flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-medium transition-colors hover:bg-opacity-80 text-primary">
                <ScanSearch className="w-3.5 h-3.5" />
                Review
                <ChevronDown className="w-3.5 h-3.5 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <motion.div
                animate={{ width: showCustomPromptInput ? 280 : "auto" }}
                transition={{
                  duration: reducedMotion ? 0 : 0.2,
                  ease: [0.215, 0.61, 0.355, 1],
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
                        ease: [0.215, 0.61, 0.355, 1],
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
                        aria-label="Review prompt"
                      />
                      <div className="flex items-center justify-end gap-1 px-1 pb-0.5">
                        <button
                          onClick={handleCustomPromptCancel}
                          className="px-2 py-1 text-xs rounded transition-colors text-tertiary hover:text-primary"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleCustomPromptSubmit}
                          disabled={!customPrompt.trim()}
                          className={cn(
                            "px-2 py-1 text-xs rounded transition-colors flex items-center gap-1",
                            customPrompt.trim()
                              ? "bg-accent-primary text-white"
                              : "bg-transparent text-muted",
                          )}
                        >
                          <ScanSearch className="w-3 h-3" />
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
                        ease: [0.215, 0.61, 0.355, 1],
                      }}
                    >
                      <DropdownMenuItem onSelect={() => handleRunReview("uncommitted")}>
                        <ScanSearch className="w-3 h-3" />
                        <span>Uncommitted changes</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleRunReview("base")}>
                        <GitBranch className="w-3 h-3" />
                        <span>Against base branch</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={(e) => {
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
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          {activeTab === "changes" && showChangesTab && (
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

          {activeTab === "git" && (
            <motion.div
              key="git"
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
              transition={{
                duration: reducedMotion ? 0 : 0.15,
                ease: [0.215, 0.61, 0.355, 1],
              }}
              className="h-full overflow-hidden flex flex-col"
            >
              <GitTab worktreePath={worktreePath} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
