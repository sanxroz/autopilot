import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store';
import type { PRChecksResult, PRDetailedInfo, PRStatus } from '../types/github';

export function useCachedPRData({
  repoPath,
  prNumber,
  prStatus,
  includeChecks = false,
  includeDetails = true,
}: {
  repoPath: string | null;
  prNumber: number | null;
  prStatus?: PRStatus | null;
  includeChecks?: boolean;
  includeDetails?: boolean;
}) {
  const getPRDataCache = useAppStore((state) => state.getPRDataCache);
  const setPRDataCache = useAppStore((state) => state.setPRDataCache);

  const [checksResult, setChecksResult] = useState<PRChecksResult | null>(() => {
    const cached = repoPath && prNumber ? getPRDataCache(repoPath, prNumber) : null;
    return cached?.checksResult ?? null;
  });
  const [prDetails, setPrDetails] = useState<PRDetailedInfo | null>(() => {
    const cached = repoPath && prNumber ? getPRDataCache(repoPath, prNumber) : null;
    return cached?.prDetails ?? null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastPrStatusRef = useRef<PRStatus | null>(null);
  const initialFetchDoneRef = useRef(false);
  const loadedFromCacheRef = useRef(false);
  const requestSeqRef = useRef(0);
  const activeContextRef = useRef({ repoPath, prNumber });
  activeContextRef.current = { repoPath, prNumber };

  const fetchData = useCallback(async (isPolling = false) => {
    if (!repoPath || !prNumber) {
      setChecksResult(null);
      setPrDetails(null);
      return;
    }

    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    const requestRepoPath = repoPath;
    const requestPrNumber = prNumber;

    if (!isPolling) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const [details, checks] = await Promise.all([
        includeDetails
          ? invoke<PRDetailedInfo>('get_pr_details', { repoPath, prNumber })
          : Promise.resolve(null),
        includeChecks ? invoke<PRChecksResult>('get_pr_checks', { repoPath, prNumber }) : Promise.resolve(null),
      ]);
      if (
        requestSeq !== requestSeqRef.current ||
        activeContextRef.current.repoPath !== requestRepoPath ||
        activeContextRef.current.prNumber !== requestPrNumber
      ) {
        return;
      }

      if (includeDetails) setPrDetails(details);
      if (includeChecks) setChecksResult(checks);
      setPRDataCache(repoPath, prNumber, {
        ...(includeDetails ? { prDetails: details } : {}),
        ...(includeChecks ? { checksResult: checks } : {}),
      });
      if (isPolling) setError(null);
    } catch (e) {
      if (
        requestSeq !== requestSeqRef.current ||
        activeContextRef.current.repoPath !== requestRepoPath ||
        activeContextRef.current.prNumber !== requestPrNumber
      ) {
        return;
      }
      if (!isPolling) {
        setError(String(e));
        if (includeDetails) setPrDetails(null);
        if (includeChecks) setChecksResult(null);
      }
    } finally {
      if (
        !isPolling &&
        requestSeq === requestSeqRef.current &&
        activeContextRef.current.repoPath === requestRepoPath &&
        activeContextRef.current.prNumber === requestPrNumber
      ) {
        setIsLoading(false);
      }
    }
  }, [includeChecks, includeDetails, prNumber, repoPath, setPRDataCache]);

  useEffect(() => {
    if (!repoPath || !prNumber) {
      setChecksResult(null);
      setPrDetails(null);
      setError(null);
      return;
    }

    initialFetchDoneRef.current = false;
    loadedFromCacheRef.current = false;
    lastPrStatusRef.current = null;

    const cached = getPRDataCache(repoPath, prNumber);
    const hasRequiredCache =
      (!includeDetails || cached?.prDetails) &&
      (!includeChecks || cached?.checksResult);
    if (hasRequiredCache) {
      loadedFromCacheRef.current = true;
      if (includeDetails) setPrDetails(cached?.prDetails ?? null);
      if (includeChecks) setChecksResult(cached?.checksResult ?? null);
      setError(null);
    } else {
      void fetchData();
    }

    initialFetchDoneRef.current = true;
  }, [fetchData, getPRDataCache, includeChecks, includeDetails, prNumber, repoPath]);

  useEffect(() => {
    if (!prStatus) return;

    const prev = lastPrStatusRef.current;
    if (!prev) {
      lastPrStatusRef.current = prStatus;
      if (loadedFromCacheRef.current && initialFetchDoneRef.current) {
        loadedFromCacheRef.current = false;
        void fetchData(true);
      }
      return;
    }

    const hasChanged =
      prStatus.checks_status !== prev.checks_status ||
      prStatus.review_decision !== prev.review_decision ||
      prStatus.state !== prev.state ||
      prStatus.merged !== prev.merged ||
      prStatus.draft !== prev.draft;

    if (hasChanged) {
      lastPrStatusRef.current = prStatus;
      if (initialFetchDoneRef.current) {
        void fetchData(true);
      }
    }
  }, [fetchData, prStatus]);

  return { checksResult, prDetails, isLoading, error, fetchData };
}
