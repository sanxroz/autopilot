import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store';
import type { RepoPRStatuses, RepoPathInput } from '../types/github';

export function usePRHubPolling() {
  const repositories = useAppStore((state) => state.repositories);
  const githubSettings = useAppStore((state) => state.githubSettings);
  const setPRHubData = useAppStore((state) => state.setPRHubData);
  const setAssignedIssues = useAppStore((state) => state.setAssignedIssues);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isFetchingRef = useRef(false);

  const fetchAllOpenPRs = useCallback(async () => {
    if (!githubSettings.ghCliAvailable || repositories.length === 0 || isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;
    try {
      const fetchPromises: Promise<void>[] = [];

      if (repositories.length > 0) {
        fetchPromises.push((async () => {
          const repos: RepoPathInput[] = repositories.map((r) => ({ repo_path: r.info.path }));
          const results = await invoke<RepoPRStatuses[]>('get_all_open_prs_for_repos', { repos });
          const next: Record<string, RepoPRStatuses['statuses']> = {};
          for (const result of results) {
            next[result.repo_path] = result.statuses;
          }
          setPRHubData(next);
        })());
      }

      fetchPromises.push((async () => {
        try {
          const issues = await invoke<any[]>('get_assigned_issues');
          setAssignedIssues(issues);
        } catch (e) {
          console.error('Failed to fetch assigned issues:', e);
        }
      })());

      await Promise.allSettled(fetchPromises);

    } catch (e) {
      console.error('Failed to fetch PR Hub data:', e);
    } finally {
      isFetchingRef.current = false;
    }
  }, [githubSettings.ghCliAvailable, repositories, setPRHubData, setAssignedIssues]);

  useEffect(() => {
    if (!githubSettings.ghCliAvailable || repositories.length === 0) {
      return;
    }

    const startPolling = () => {
      fetchAllOpenPRs();
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      pollingRef.current = setInterval(fetchAllOpenPRs, githubSettings.pollingIntervalMs);
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
  }, [githubSettings.ghCliAvailable, githubSettings.pollingIntervalMs, repositories.length, fetchAllOpenPRs]);

  return { refresh: fetchAllOpenPRs };
}
