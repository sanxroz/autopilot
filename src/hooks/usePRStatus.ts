import { useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store';
import type { PRStatus, RepoPRStatuses, RepoWithWorktrees } from '../types/github';

export function usePRStatusPolling() {
  const {
    repositories,
    githubSettings,
    setPRStatusBatch,
    collapsedRepos,
  } = useAppStore();
  
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFetchingRef = useRef(false);

  const fetchAllPRs = useCallback(async () => {
    if (!githubSettings.ghCliAvailable || isFetchingRef.current || repositories.length === 0) {
      return;
    }

    isFetchingRef.current = true;

    try {
      const visibleRepos = repositories.filter(r => !collapsedRepos.has(r.info.path));
      
      if (visibleRepos.length === 0) {
        isFetchingRef.current = false;
        return;
      }

      const repos: RepoWithWorktrees[] = visibleRepos.map(r => ({
        repo_path: r.info.path,
        worktrees: r.worktrees.flatMap((wt) =>
          wt.branch !== null && wt.branch !== 'main' && wt.branch !== 'master'
            ? [{
                worktree_path: wt.path,
                branch: wt.branch,
                head_oid: wt.head_oid ?? null,
              }]
            : []
        ),
      }));
      
      const results = await invoke<RepoPRStatuses[]>('get_all_prs_for_repos', { repos });

      const failedLookups = results.flatMap((result) =>
        result.failed_worktrees.map((worktreePath) => `${result.repo_path}:${worktreePath}`)
      );

      if (failedLookups.length > 0) {
        console.warn(
          'Some PR lookups failed; preserving previous sidebar PR data for those worktrees:',
          failedLookups
        );
      }

      setPRStatusBatch(results);
    } catch (e) {
      console.error('Failed to fetch PRs:', e);
    } finally {
      isFetchingRef.current = false;
    }
  }, [repositories, githubSettings.ghCliAvailable, setPRStatusBatch, collapsedRepos]);

  useEffect(() => {
    if (!githubSettings.ghCliAvailable) {
      return;
    }

    const startPolling = () => {
      fetchAllPRs();
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      pollingRef.current = setInterval(() => {
        void fetchAllPRs();
      }, githubSettings.pollingIntervalMs);
    };

    const stopPolling = () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
      }
    };

    if (!document.hidden) {
      startPolling();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchAllPRs, githubSettings.pollingIntervalMs, githubSettings.ghCliAvailable]);

  return { refresh: fetchAllPRs };
}

export function usePRStatusForWorktree(worktreePath: string | null): PRStatus | null {
  const prStatusByWorktreePath = useAppStore((state) => state.prStatusByWorktreePath);

  if (!worktreePath) return null;

  return prStatusByWorktreePath[worktreePath] || null;
}
