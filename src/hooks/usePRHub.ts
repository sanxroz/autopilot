import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store';
import type { GithubIssue, RepoPRStatuses, RepoPathInput } from '../types/github';

let refreshInFlight: Promise<void> | null = null;
let refreshQueuedCallback: (() => Promise<void>) | null = null;

export function usePRHubRefresh() {
  const repositories = useAppStore((state) => state.repositories);
  const githubSettings = useAppStore((state) => state.githubSettings);
  const setPRHubData = useAppStore((state) => state.setPRHubData);
  const setAssignedIssues = useAppStore((state) => state.setAssignedIssues);

  return useCallback(async () => {
    if (!githubSettings.ghCliAvailable) {
      return;
    }

    const fetchOnce = async () => {
      const fetchPromises: Promise<void>[] = [];

      if (repositories.length === 0) {
        setPRHubData({});
      } else {
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
          const issues = await invoke<GithubIssue[]>('get_assigned_issues');
          setAssignedIssues(issues);
        } catch (e) {
          console.error('Failed to fetch assigned issues:', e);
        }
      })());

      await Promise.allSettled(fetchPromises);
    };

    const runLatestRefresh = async () => {
      await fetchOnce();
    };

    if (refreshInFlight) {
      refreshQueuedCallback = runLatestRefresh;
      return refreshInFlight;
    }

    const runRefresh = async () => {
      try {
        await runLatestRefresh();
        while (refreshQueuedCallback) {
          const queuedCallback = refreshQueuedCallback;
          refreshQueuedCallback = null;
          await queuedCallback();
        }
      } catch (e) {
        console.error('Failed to fetch PR Hub data:', e);
      } finally {
        refreshInFlight = null;
      }
    };

    refreshInFlight = runRefresh();
    return refreshInFlight;
  }, [githubSettings.ghCliAvailable, repositories, setPRHubData, setAssignedIssues]);
}

export function usePRHubPolling() {
  const githubSettings = useAppStore((state) => state.githubSettings);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refresh = usePRHubRefresh();

  useEffect(() => {
    if (!githubSettings.ghCliAvailable) {
      return;
    }

    const startPolling = () => {
      refresh();
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      pollingRef.current = setInterval(() => {
        void refresh();
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
  }, [githubSettings.ghCliAvailable, githubSettings.pollingIntervalMs, refresh]);

  return { refresh };
}
