import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../store";
import type { WorktreeInfo } from "../types";
import { NewWorktreeDialog } from "./NewWorktreeDialog";

function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return "";

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return "just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function Sidebar() {
  const {
    repositories,
    addRepository,
    toggleRepoExpanded,
    selectWorktree,
    selectedWorktree,
  } = useAppStore();
  const [showWorktreeDialog, setShowWorktreeDialog] = useState<string | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const handleAddRepository = async () => {
    setError(null);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Repository",
      });

      console.log("Selected path:", selected);

      if (selected) {
        await addRepository(selected as string);
      }
    } catch (e) {
      console.error("Failed to add repository:", e);
      setError(String(e));
    }
  };

  const handleWorktreeClick = async (worktree: WorktreeInfo) => {
    await selectWorktree(worktree);
  };

  return (
    <div className="w-64 bg-transparent border-r border-zinc-700/50 flex flex-col h-full pt-8">
      <div className="flex-1 overflow-y-auto py-2">
        {repositories.map((repo) => (
          <div key={repo.info.path} className="mb-2">
            <button
              onClick={() => toggleRepoExpanded(repo.info.path)}
              className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-zinc-800/50 transition-colors"
            >
              <svg
                className={`w-3 h-3 text-zinc-500 transition-transform ${
                  repo.isExpanded ? "rotate-90" : ""
                }`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M6 6L14 10L6 14V6Z" />
              </svg>
              <span className="text-zinc-100 font-medium text-sm">
                {repo.info.name}
              </span>
            </button>

            {repo.isExpanded && (
              <div className="ml-4">
                <button
                  onClick={() => setShowWorktreeDialog(repo.info.path)}
                  className="flex items-center gap-2 px-3 py-1.5 w-full text-left text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30 transition-colors text-sm"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  <span>New workspace</span>
                </button>

                {repo.worktrees.map((wt) => (
                  <button
                    key={wt.path}
                    onClick={() => handleWorktreeClick(wt)}
                    className={`block w-full text-left px-3 py-1.5 transition-colors ${
                      selectedWorktree?.path === wt.path
                        ? "bg-zinc-700/50 text-zinc-100"
                        : "text-zinc-300 hover:bg-zinc-800/30 hover:text-zinc-100"
                    }`}
                  >
                    <div className="text-sm font-medium truncate">
                      {wt.branch || wt.name}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {formatTimeAgo(wt.last_modified)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="mx-3 mb-2 p-2 text-xs text-red-400 bg-red-900/20 border border-red-800 rounded">
          {error}
        </div>
      )}

      <button
        onClick={handleAddRepository}
        className="m-3 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 rounded transition-colors border border-zinc-700/50 hover:border-zinc-600"
      >
        Add repository
      </button>

      {showWorktreeDialog && (
        <NewWorktreeDialog
          repoPath={showWorktreeDialog}
          onClose={() => setShowWorktreeDialog(null)}
        />
      )}
    </div>
  );
}
