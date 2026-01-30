import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store';

interface WorktreeDiffStats {
  path: string;
  diff_stats: { additions: number; deletions: number } | null;
}

export function useDiffStatsLoader() {
  const repositories = useAppStore((state) => state.repositories);
  const updateWorktreeDiffStats = useAppStore((state) => state.updateWorktreeDiffStats);
  const isInitialized = useAppStore((state) => state.isInitialized);
  const loadedPathsRef = useRef<Set<string>>(new Set());
  const loadingRef = useRef(false);

  useEffect(() => {
    if (!isInitialized || repositories.length === 0 || loadingRef.current) return;

    const allWorktrees = repositories.flatMap((repo) => repo.worktrees);
    
    const clearStaleLoadedPaths = () => {
      for (const path of loadedPathsRef.current) {
        const wt = allWorktrees.find((w) => w.path === path);
        const wasRefreshedWithoutStats = wt && !wt.diff_stats;
        if (wasRefreshedWithoutStats) {
          loadedPathsRef.current.delete(path);
        }
      }
    };
    clearStaleLoadedPaths();

    const worktreePaths = allWorktrees
      .filter((wt) => wt.name !== 'main' && !wt.diff_stats && !loadedPathsRef.current.has(wt.path))
      .map((wt) => wt.path);

    if (worktreePaths.length === 0) return;

    loadingRef.current = true;
    worktreePaths.forEach((p) => loadedPathsRef.current.add(p));

    invoke<WorktreeDiffStats[]>('get_worktrees_diff_stats', { worktreePaths })
      .then((stats) => {
        updateWorktreeDiffStats(stats);
      })
      .catch((e) => {
        console.error('Failed to load diff stats:', e);
        worktreePaths.forEach((p) => loadedPathsRef.current.delete(p));
      })
      .finally(() => {
        loadingRef.current = false;
      });
  }, [isInitialized, repositories, updateWorktreeDiffStats]);
}
