import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';

const POLLING_INTERVAL = 3000;

export function useProcessStatusPolling() {
  const refreshProcessStatuses = useAppStore((state) => state.refreshProcessStatuses);
  const isInitialized = useAppStore((state) => state.isInitialized);
  const repositories = useAppStore((state) => state.repositories);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isInitialized || repositories.length === 0) return;

    refreshProcessStatuses();

    intervalRef.current = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshProcessStatuses();
      }
    }, POLLING_INTERVAL);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshProcessStatuses();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isInitialized, repositories.length, refreshProcessStatuses]);
}
