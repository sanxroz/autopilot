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
  const inFlightRefreshes = useRef<Set<string>>(new Set());
  const pendingRefreshNeeded = useRef<Set<string>>(new Set());
  const desiredWorktreePaths = useRef<Set<string>>(new Set());

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
    if (inFlightRefreshes.current.has(repoPath)) {
      pendingRefreshNeeded.current.add(repoPath);
      return;
    }

    const existing = pendingWorktreeUpdates.current.get(repoPath);
    if (existing) clearTimeout(existing);
    
    const timeout = setTimeout(async () => {
      pendingWorktreeUpdates.current.delete(repoPath);
      if (inFlightRefreshes.current.has(repoPath)) {
        pendingRefreshNeeded.current.add(repoPath);
        return;
      }
      
      inFlightRefreshes.current.add(repoPath);
      try {
        await refreshWorktrees(repoPath);
      } finally {
        inFlightRefreshes.current.delete(repoPath);
        if (pendingRefreshNeeded.current.has(repoPath)) {
          pendingRefreshNeeded.current.delete(repoPath);
          debouncedWorktreeRefresh(repoPath);
        }
      }
    }, 750);
    
    pendingWorktreeUpdates.current.set(repoPath, timeout);
  }, [refreshWorktrees]);

  useEffect(() => {
    if (!isInitialized) return;

    let mounted = true;

    const setupListeners = async () => {
      if (!unlistenHeadRef.current) {
        unlistenHeadRef.current = await listen<GitChangeEvent>('git-head-changed', (event) => {
          if (!mounted) return;
          debouncedBranchUpdate(event.payload.worktree_path);
        });
      }

      if (!unlistenWorktreeRef.current) {
        unlistenWorktreeRef.current = await listen<WorktreeChangeEvent>('worktree-changed', (event) => {
          if (!mounted) return;
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
    if (!isInitialized) return;

    const nextWorktreePaths = new Set(
      repositories.flatMap((repo) => repo.worktrees.map((worktree) => worktree.path)),
    );

    for (const worktreePath of desiredWorktreePaths.current) {
      if (!nextWorktreePaths.has(worktreePath)) {
        desiredWorktreePaths.current.delete(worktreePath);
        invoke('stop_watching_worktree_files', { worktreePath }).catch(console.error);
      }
    }

    for (const worktreePath of nextWorktreePaths) {
      if (desiredWorktreePaths.current.has(worktreePath)) continue;
      desiredWorktreePaths.current.add(worktreePath);

      void (async () => {
        while (desiredWorktreePaths.current.has(worktreePath)) {
          try {
            await invoke('start_watching_worktree_files', { worktreePath });
            if (!desiredWorktreePaths.current.has(worktreePath)) {
              await invoke('stop_watching_worktree_files', { worktreePath });
            }
            return;
          } catch (error) {
            console.error(error);
            await new Promise((resolve) => setTimeout(resolve, 1_000));
          }
        }
      })();
    }

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
      desiredWorktreePaths.current.clear();
      invoke('stop_all_watchers').catch(console.error);
    };
  }, []);
}
