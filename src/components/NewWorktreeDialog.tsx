import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store';
import type { BranchInfo } from '../types';

interface Props {
  repoPath: string;
  onClose: () => void;
}

export function NewWorktreeDialog({ repoPath, onClose }: Props) {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [worktreeName, setWorktreeName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refreshWorktrees } = useAppStore();

  useEffect(() => {
    invoke<BranchInfo[]>('list_branches', { repoPath })
      .then(setBranches)
      .catch(console.error);
  }, [repoPath]);

  const handleCreate = async () => {
    if (!selectedBranch || !worktreeName) return;

    setLoading(true);
    setError(null);

    try {
      await invoke('create_worktree', {
        repoPath,
        worktreeName,
        branchName: selectedBranch,
        targetPath: null,
      });
      await refreshWorktrees(repoPath);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleBranchSelect = (branchName: string) => {
    setSelectedBranch(branchName);
    if (!worktreeName) {
      const cleanName = branchName
        .replace(/^origin\//, '')
        .replace(/\//g, '-');
      setWorktreeName(cleanName);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-96 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-zinc-100 mb-4">New Workspace</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Branch</label>
            <select
              value={selectedBranch}
              onChange={(e) => handleBranchSelect(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500"
            >
              <option value="">Select a branch...</option>
              {branches
                .filter((b) => !b.is_head)
                .map((branch) => (
                  <option key={branch.name} value={branch.name}>
                    {branch.name} {branch.is_remote ? '(remote)' : ''}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Workspace name</label>
            <input
              type="text"
              value={worktreeName}
              onChange={(e) => setWorktreeName(e.target.value)}
              placeholder="e.g., feature-branch"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500"
            />
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded p-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!selectedBranch || !worktreeName || loading}
            className="px-4 py-2 text-sm bg-zinc-100 text-zinc-900 rounded hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
