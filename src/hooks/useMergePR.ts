import { useCallback, useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { createKeyedTaskRunner } from '../lib/keyed-task-runner';
import { refreshPRStatuses } from './usePRStatus';

interface UseMergePROptions {
  repoPath: string | null;
  prNumber: number | null;
}

interface UseMergePRReturn {
  isMerging: boolean;
  hasMerged: boolean;
  handleMerge: () => Promise<void>;
}

const mergeTasks = createKeyedTaskRunner();
const mergedKeys = new Set<string>();

function getMergeKey(repoPath: string, prNumber: number): string {
  return `${repoPath}\0${prNumber}`;
}

function startMerge(repoPath: string, prNumber: number): Promise<void> {
  const key = getMergeKey(repoPath, prNumber);
  if (mergedKeys.has(key)) return Promise.resolve();

  return mergeTasks.run(key, () =>
    invoke<{ success: boolean; message: string }>('merge_pr', {
      repoPath,
      prNumber,
    })
      .then(async (result) => {
        if (!result.success) throw new Error(result.message || 'Merge failed');

        mergedKeys.add(key);
        toast.success(`PR #${prNumber} merged`);
        try {
          await refreshPRStatuses(repoPath);
        } catch (error) {
          console.error('Failed to refresh PR status after merge:', error);
        }
      })
      .catch((error) => {
        toast.error(String(error));
      })
  );
}

export function useMergePR({ repoPath, prNumber }: UseMergePROptions): UseMergePRReturn {
  const mergeKey = repoPath && prNumber ? getMergeKey(repoPath, prNumber) : null;
  const isMerging = useSyncExternalStore(
    mergeTasks.subscribe,
    () => mergeKey !== null && mergeTasks.has(mergeKey),
  );
  const hasMerged = useSyncExternalStore(
    mergeTasks.subscribe,
    () => mergeKey !== null && mergedKeys.has(mergeKey),
  );

  const handleMerge = useCallback(async () => {
    if (!repoPath || !prNumber) return;
    await startMerge(repoPath, prNumber);
  }, [repoPath, prNumber]);

  return { isMerging, hasMerged, handleMerge };
}
