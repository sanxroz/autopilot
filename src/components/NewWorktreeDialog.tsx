import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store';
import type { BranchInfo } from '../types';
import { useTheme } from '../hooks/useTheme';

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
  const theme = useTheme();

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
      invoke('create_worktree', {
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
    if (worktreeName == '') {
      const cleanName = branchName
        .replace(/^origin\//, '')
        .replace(/\//g, '-');
      setWorktreeName(cleanName);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="border rounded-lg p-6 w-96 shadow-xl"
        style={{
          background: theme.bg.secondary,
          borderColor: theme.border.default,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4" style={{ color: theme.text.primary }}>
          New Workspace
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1" style={{ color: theme.text.secondary }}>
              Branch
            </label>
            <select
              value={selectedBranch}
              onChange={(e) => handleBranchSelect(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm transition-shadow"
              style={{
                background: theme.bg.tertiary,
                borderColor: theme.border.subtle,
                color: theme.text.primary,
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.boxShadow = `0 0 0 2px ${theme.bg.secondary}, 0 0 0 4px ${theme.accent.primary}`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = 'none';
              }}
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
            <label className="block text-sm mb-1" style={{ color: theme.text.secondary }}>
              Workspace name
            </label>
            <input
              type="text"
              value={worktreeName}
              onChange={(e) => setWorktreeName(e.target.value)}
              placeholder="e.g., feature-branch"
              className="w-full border rounded px-3 py-2 text-sm transition-shadow"
              style={{
                background: theme.bg.tertiary,
                borderColor: theme.border.subtle,
                color: theme.text.primary,
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.boxShadow = `0 0 0 2px ${theme.bg.secondary}, 0 0 0 4px ${theme.accent.primary}`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          {error && (
            <div
              className="text-sm rounded p-2 border"
              style={{
                color: theme.semantic.error,
                background: theme.semantic.errorMuted,
                borderColor: theme.semantic.error,
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm transition-colors"
            style={{ color: theme.text.secondary }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!selectedBranch || !worktreeName || loading}
            className="px-4 py-2 text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: theme.accent.primary,
              color: theme.bg.primary,
            }}
          >
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
