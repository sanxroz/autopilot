import { useEffect, useRef, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useAppStore } from '../store';

interface GitChangeEvent {
  repo_path: string;
  worktree_path: string;
  change_type: string;
}

interface WorktreeChangeEvent {
  repo_path: string;
  change_type: string;
}

export function useGitWatcher() {
  const repositories = useAppStore((state) => state.repositories);
  const refreshWorktrees = useAppStore((state) => state.refreshWorktrees);
  const updateWorktreeBranch = useAppStore((state) => state.updateWorktreeBranch);
  const isInitialized = useAppStore((state) => state.isInitialized);
  const unlistenHeadRef = useRef<UnlistenFn | null>(null);
  const unlistenWorktreeRef = useRef<UnlistenFn | null>(null);
  const pendingBranchUpdates = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingWorktreeUpdates = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const repoWorktreeSignature = useMemo(() => {
    return repositories.map(r => ({
      path: r.info.path,
      worktrees: r.worktrees.map(wt => wt.path).sort().join(',')
    }));
  }, [repositories]);

  const debouncedBranchUpdate = useCallback((worktreePath: string) => {
    const existing = pendingBranchUpdates.current.get(worktreePath);
    if (existing) clearTimeout(existing);
    
    const timeout = setTimeout(() => {
      pendingBranchUpdates.current.delete(worktreePath);
      updateWorktreeBranch(worktreePath);
    }, 300);
    
    pendingBranchUpdates.current.set(worktreePath, timeout);
  }, [updateWorktreeBranch]);

  const debouncedWorktreeRefresh = useCallback((repoPath: string) => {
    const existing = pendingWorktreeUpdates.current.get(repoPath);
    if (existing) clearTimeout(existing);
    
    const timeout = setTimeout(() => {
      pendingWorktreeUpdates.current.delete(repoPath);
      refreshWorktrees(repoPath);
    }, 500);
    
    pendingWorktreeUpdates.current.set(repoPath, timeout);
  }, [refreshWorktrees]);

  useEffect(() => {
    if (!isInitialized) return;

    let mounted = true;

    const setupListeners = async () => {
      if (!unlistenHeadRef.current) {
        unlistenHeadRef.current = await listen<GitChangeEvent>('git-head-changed', (event) => {
          if (!mounted) return;
          console.log('[GitWatcher] Branch changed:', event.payload);
          debouncedBranchUpdate(event.payload.worktree_path);
        });
      }

      if (!unlistenWorktreeRef.current) {
        unlistenWorktreeRef.current = await listen<WorktreeChangeEvent>('worktree-changed', (event) => {
          if (!mounted) return;
          console.log('[GitWatcher] Worktree changed:', event.payload);
          debouncedWorktreeRefresh(event.payload.repo_path);
        });
      }
    };

    setupListeners();

    return () => {
      mounted = false;
    };
  }, [isInitialized, debouncedBranchUpdate, debouncedWorktreeRefresh]);

  useEffect(() => {
    if (!isInitialized || repositories.length === 0) return;

    for (const repo of repositories) {
      const worktreePaths = repo.worktrees.map(wt => wt.path);
      invoke('start_watching_repository', {
        repoPath: repo.info.path,
        worktreePaths,
      }).catch(console.error);
    }
  }, [isInitialized, repoWorktreeSignature]);

  useEffect(() => {
    return () => {
      if (unlistenHeadRef.current) {
        unlistenHeadRef.current();
        unlistenHeadRef.current = null;
      }
      if (unlistenWorktreeRef.current) {
        unlistenWorktreeRef.current();
        unlistenWorktreeRef.current = null;
      }
      invoke('stop_all_watchers').catch(console.error);
    };
  }, []);
}
