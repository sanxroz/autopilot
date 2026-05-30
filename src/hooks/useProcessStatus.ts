import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../store';

const POLLING_INTERVAL = 10000;
const REFRESH_TIMEOUT = 30000;

export function useProcessStatusPolling() {
  const refreshProcessStatuses = useAppStore((state) => state.refreshProcessStatuses);
  const isInitialized = useAppStore((state) => state.isInitialized);
  const repositories = useAppStore((state) => state.repositories);
  const intervalRef = useRef<number | null>(null);
  const activeRefreshCountRef = useRef(0);
  const refreshStartedAtRef = useRef<number | null>(null);
  const staleRefreshRetryInFlightRef = useRef(false);

  const refreshIfIdle = useCallback(async () => {
    const now = Date.now();
    let isStaleRetry = false;

    if (staleRefreshRetryInFlightRef.current) return;

    if (activeRefreshCountRef.current > 0) {
      if (
        refreshStartedAtRef.current === null ||
        now - refreshStartedAtRef.current < REFRESH_TIMEOUT
      ) {
        return;
      }

      staleRefreshRetryInFlightRef.current = true;
      isStaleRetry = true;
    }

    activeRefreshCountRef.current += 1;
    refreshStartedAtRef.current = now;
    try {
      await refreshProcessStatuses();
    } finally {
      activeRefreshCountRef.current = Math.max(0, activeRefreshCountRef.current - 1);
      if (isStaleRetry) {
        staleRefreshRetryInFlightRef.current = false;
      }
      if (activeRefreshCountRef.current === 0) {
        refreshStartedAtRef.current = null;
      }
    }
  }, [refreshProcessStatuses]);

  useEffect(() => {
    if (!isInitialized || repositories.length === 0) return;

    refreshIfIdle();

    intervalRef.current = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshIfIdle();
      }
    }, POLLING_INTERVAL);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshIfIdle();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isInitialized, repositories.length, refreshIfIdle]);
}
