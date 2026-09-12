import { useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store';
import type { PRStatus, RepoPRStatuses, RepoWithWorktrees } from '../types/github';

let latestRefreshRequest = 0;

export async function refreshPRStatuses(repoPath?: string): Promise<void> {
  const {
    repositories,
    githubSettings,
    collapsedRepos,
    setPRStatusBatch,
  } = useAppStore.getState();

  if (!githubSettings.ghCliAvailable || repositories.length === 0) return;

  const visibleRepos = repositories.filter((repo) =>
    repoPath ? repo.info.path === repoPath : !collapsedRepos.has(repo.info.path)
  );
  if (visibleRepos.length === 0) return;

  const repos: RepoWithWorktrees[] = visibleRepos.map((repo) => ({
    repo_path: repo.info.path,
    worktrees: repo.worktrees.flatMap((worktree) =>
      worktree.branch !== null && worktree.branch !== 'main' && worktree.branch !== 'master'
        ? [{
            worktree_path: worktree.path,
            branch: worktree.branch,
            head_oid: worktree.head_oid ?? null,
          }]
        : []
    ),
  }));

  const requestId = ++latestRefreshRequest;
  const results = await invoke<RepoPRStatuses[]>('get_all_prs_for_repos', { repos });
  if (requestId !== latestRefreshRequest) return;

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
}

export function usePRStatusPolling() {
  const repositories = useAppStore((state) => state.repositories);
  const githubSettings = useAppStore((state) => state.githubSettings);
  const collapsedRepos = useAppStore((state) => state.collapsedRepos);
  
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFetchingRef = useRef(false);

  const fetchAllPRs = useCallback(async () => {
    if (!githubSettings.ghCliAvailable || isFetchingRef.current || repositories.length === 0) {
      return;
    }

    isFetchingRef.current = true;

    try {
      await refreshPRStatuses();
    } catch (e) {
      console.error('Failed to fetch PRs:', e);
    } finally {
      isFetchingRef.current = false;
    }
  }, [repositories, githubSettings.ghCliAvailable, collapsedRepos]);

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
