import { useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store';
import type { PRStatus, RepoPRStatuses, RepoWithBranches } from '../types/github';

export function usePRStatusPolling() {
  const {
    repositories,
    githubSettings,
    setPRStatusBatch,
  } = useAppStore();
  
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFetchingRef = useRef(false);

  const fetchAllPRs = useCallback(async () => {
    if (!githubSettings.ghCliAvailable || isFetchingRef.current || repositories.length === 0) {
      return;
    }

    isFetchingRef.current = true;

    try {
      const repos: RepoWithBranches[] = repositories.map(r => ({
        repo_path: r.info.path,
        branches: r.worktrees
          .map(wt => wt.branch)
          .filter((b): b is string => b !== null && b !== 'main' && b !== 'master'),
      }));
      
      const results = await invoke<RepoPRStatuses[]>('get_all_prs_for_repos', { repos });
      
      const batch: Record<string, Record<string, PRStatus>> = {};
      for (const result of results) {
        const prMap: Record<string, PRStatus> = {};
        for (const pr of result.statuses) {
          prMap[pr.head_branch] = pr;
        }
        batch[result.repo_path] = prMap;
      }
      
      setPRStatusBatch(batch);
    } catch (e) {
      console.error('Failed to fetch PRs:', e);
    } finally {
      isFetchingRef.current = false;
    }
  }, [repositories, githubSettings.ghCliAvailable, setPRStatusBatch]);

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
