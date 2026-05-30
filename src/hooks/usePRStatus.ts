import { useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store';
import type { PRStatus, RepoPRStatuses, RepoWithBranches } from '../types/github';

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

      const repos: RepoWithBranches[] = visibleRepos.map(r => ({
        repo_path: r.info.path,
        branches: r.worktrees
          .map(wt => wt.branch)
          .filter((b): b is string => b !== null && b !== 'main' && b !== 'master'),
      }));
      
      const results = await invoke<RepoPRStatuses[]>('get_all_prs_for_repos', { repos });

      const failedLookups = results.flatMap((result) =>
        (result.failed_branches ?? []).map((branch) => `${result.repo_path}:${branch}`)
      );

      if (failedLookups.length > 0) {
        console.warn(
          'Some PR lookups failed; preserving previous sidebar PR data for those branches:',
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

    fetchAllPRs();

    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    pollingRef.current = setInterval(fetchAllPRs, githubSettings.pollingIntervalMs);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [fetchAllPRs, githubSettings.pollingIntervalMs, githubSettings.ghCliAvailable]);

  return { refresh: fetchAllPRs };
}

export function usePRStatusForBranch(repoPath: string, branch: string | null): PRStatus | null {
  const prStatusByBranch = useAppStore((state) => state.prStatusByBranch);
  
  if (!branch) return null;
  
  const repoStatuses = prStatusByBranch[repoPath];
  if (!repoStatuses) return null;
  
  return repoStatuses[branch] || null;
}
