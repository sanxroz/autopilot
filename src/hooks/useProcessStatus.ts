import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { getNextAgentFinishedDeadline } from '../store/agentRunState';

const ACTIVE_POLLING_INTERVAL = 3000;
const IDLE_POLLING_INTERVAL = 10000;
const REFRESH_TIMEOUT = 30000;

export function useProcessStatusPolling() {
  const refreshProcessStatuses = useAppStore((state) => state.refreshProcessStatuses);
  const refreshSidebarGroupsFromDisk = useAppStore((state) => state.refreshSidebarGroupsFromDisk);
  const isInitialized = useAppStore((state) => state.isInitialized);
  const repositories = useAppStore((state) => state.repositories);
  const hasActiveProcesses = useAppStore((state) =>
    Object.values(state.processStatusByPath).some((status) => status !== 'none')
  );
  const nextFinishedDeadline = useAppStore((state) =>
    getNextAgentFinishedDeadline(state.agentRunByWorktreePath)
  );
  const intervalRef = useRef<number | null>(null);
  const inFlightRefreshRef = useRef<Promise<void> | null>(null);
  const refreshStartedAtRef = useRef<number | null>(null);
  const staleRefreshRetryInFlightRef = useRef(false);
  const needsRerunRef = useRef(false);
  const reportRefreshError = (error: unknown) => {
    console.error('Process status refresh failed:', error);
  };

  const refreshIfIdle = useCallback(async () => {
    const now = Date.now();
    let isStaleRetry = false;

    if (inFlightRefreshRef.current) {
      needsRerunRef.current = true;
      if (
        staleRefreshRetryInFlightRef.current ||
        refreshStartedAtRef.current === null ||
        now - refreshStartedAtRef.current < REFRESH_TIMEOUT
      ) {
        return inFlightRefreshRef.current;
      }
      staleRefreshRetryInFlightRef.current = true;
      isStaleRetry = true;
    }

    let refreshPromise: Promise<void>;
    const runRefresh = async () => {
      try {
        do {
          needsRerunRef.current = false;
          const refreshes = await Promise.allSettled([
            refreshProcessStatuses(),
            refreshSidebarGroupsFromDisk(),
          ]);
          const failedRefresh = refreshes.find(
            (refresh): refresh is PromiseRejectedResult => refresh.status === 'rejected'
          );
          if (failedRefresh) throw failedRefresh.reason;
        } while (needsRerunRef.current);
      } finally {
        if (isStaleRetry) {
          staleRefreshRetryInFlightRef.current = false;
        } else if (inFlightRefreshRef.current === refreshPromise) {
          inFlightRefreshRef.current = null;
          refreshStartedAtRef.current = null;
        }
      }
    };

    refreshPromise = runRefresh();
    if (!isStaleRetry) {
      refreshStartedAtRef.current = now;
      inFlightRefreshRef.current = refreshPromise;
    }
    return refreshPromise;
  }, [refreshProcessStatuses, refreshSidebarGroupsFromDisk]);

  useEffect(() => {
    if (!isInitialized || repositories.length === 0) return;

    void refreshIfIdle().catch(reportRefreshError);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshIfIdle().catch(reportRefreshError);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isInitialized, repositories.length, refreshIfIdle]);

  useEffect(() => {
    if (!isInitialized || repositories.length === 0) return;

    intervalRef.current = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshIfIdle().catch(reportRefreshError);
      }
    }, hasActiveProcesses ? ACTIVE_POLLING_INTERVAL : IDLE_POLLING_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [hasActiveProcesses, isInitialized, repositories.length, refreshIfIdle]);

  useEffect(() => {
    if (!isInitialized || repositories.length === 0 || nextFinishedDeadline === undefined) return;

    const timeoutId = window.setTimeout(() => {
      void refreshIfIdle().catch(reportRefreshError);
    }, Math.max(0, nextFinishedDeadline - Date.now()));

    return () => clearTimeout(timeoutId);
  }, [isInitialized, repositories.length, nextFinishedDeadline, refreshIfIdle]);
}
