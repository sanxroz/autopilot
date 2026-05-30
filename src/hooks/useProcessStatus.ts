import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../store';

const ACTIVE_POLLING_INTERVAL = 3000;
const IDLE_POLLING_INTERVAL = 10000;

export function useProcessStatusPolling() {
  const refreshProcessStatuses = useAppStore((state) => state.refreshProcessStatuses);
  const isInitialized = useAppStore((state) => state.isInitialized);
  const repositories = useAppStore((state) => state.repositories);
  const hasActiveProcesses = useAppStore((state) =>
    Object.values(state.processStatusByPath).some((status) => status !== 'none')
  );
  const intervalRef = useRef<number | null>(null);
  const inFlightRefreshRef = useRef<Promise<void> | null>(null);
  const needsRerunRef = useRef(false);

  const refreshIfIdle = useCallback(async () => {
    if (inFlightRefreshRef.current) {
      needsRerunRef.current = true;
      return inFlightRefreshRef.current;
    }

    const runRefresh = async () => {
      try {
        do {
          needsRerunRef.current = false;
          await refreshProcessStatuses();
        } while (needsRerunRef.current);
      } finally {
        inFlightRefreshRef.current = null;
      }
    };

    const refreshPromise = runRefresh();
    inFlightRefreshRef.current = refreshPromise;
    return refreshPromise;
  }, [refreshProcessStatuses]);

  useEffect(() => {
    if (!isInitialized || repositories.length === 0) return;

    refreshIfIdle();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshIfIdle();
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
        refreshIfIdle();
      }
    }, hasActiveProcesses ? ACTIVE_POLLING_INTERVAL : IDLE_POLLING_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [hasActiveProcesses, isInitialized, repositories.length, refreshIfIdle]);
}
