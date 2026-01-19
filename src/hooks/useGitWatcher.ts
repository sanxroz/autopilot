import { useEffect, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useAppStore } from '../store';

interface GitChangeEvent {
  repo_path: string;
  worktree_path: string;
  change_type: string;
}

export function useGitWatcher() {
  const repositories = useAppStore((state) => state.repositories);
  const refreshWorktrees = useAppStore((state) => state.refreshWorktrees);
  const isInitialized = useAppStore((state) => state.isInitialized);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  const repoWorktreeSignature = useMemo(() => {
    return repositories.map(r => ({
      path: r.info.path,
      worktrees: r.worktrees.map(wt => wt.path).sort().join(',')
    }));
  }, [repositories]);

  useEffect(() => {
    if (!isInitialized) return;

    let mounted = true;

    const setupListener = async () => {
      if (unlistenRef.current) return;

      unlistenRef.current = await listen<GitChangeEvent>('git-head-changed', (event) => {
        if (!mounted) return;
        console.log('[GitWatcher] Branch changed:', event.payload);
        refreshWorktrees(event.payload.repo_path);
      });
    };

    setupListener();

    return () => {
      mounted = false;
    };
  }, [isInitialized, refreshWorktrees]);

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
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
      invoke('stop_all_watchers').catch(console.error);
    };
  }, []);
}
