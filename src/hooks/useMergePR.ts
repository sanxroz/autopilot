import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

interface UseMergePROptions {
  repoPath: string | null;
  prNumber: number | null;
}

interface UseMergePRReturn {
  isMerging: boolean;
  hasMerged: boolean;
  handleMerge: () => Promise<void>;
}

export function useMergePR({ repoPath, prNumber }: UseMergePROptions): UseMergePRReturn {
  const [isMerging, setIsMerging] = useState(false);
  const [hasMerged, setHasMerged] = useState(false);

  // Track the active PR to detect stale async callbacks
  const activePrRef = useRef<{ repoPath: string | null; prNumber: number | null }>({
    repoPath: null,
    prNumber: null,
  });

  useEffect(() => {
    setHasMerged(false);
    setIsMerging(false);
    activePrRef.current = { repoPath, prNumber };
  }, [prNumber, repoPath]);

  const handleMerge = useCallback(async () => {
    if (!repoPath || !prNumber) return;

    const mergeRepoPath = repoPath;
    const mergePrNumber = prNumber;

    setIsMerging(true);
    try {
      const result = await invoke<{ success: boolean; message: string }>('merge_pr', {
        repoPath: mergeRepoPath,
        prNumber: mergePrNumber,
      });

      const isStale = activePrRef.current.repoPath !== mergeRepoPath ||
                      activePrRef.current.prNumber !== mergePrNumber;
      if (isStale) return;

      if (result.success) {
        toast.success(`PR #${mergePrNumber} merged`);
        setHasMerged(true);
      } else {
        toast.error(result.message || 'Merge failed');
      }
    } catch (e) {
      const isStale = activePrRef.current.repoPath !== mergeRepoPath ||
                      activePrRef.current.prNumber !== mergePrNumber;
      if (!isStale) {
        toast.error(String(e));
      }
    } finally {
      const isStale = activePrRef.current.repoPath !== mergeRepoPath ||
                      activePrRef.current.prNumber !== mergePrNumber;
      if (!isStale) {
        setIsMerging(false);
      }
    }
  }, [repoPath, prNumber]);

  return { isMerging, hasMerged, handleMerge };
}
