import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import type { PRAction } from '../components/PRKanbanCard';

export function usePRActions({ onAfterAction }: { onAfterAction: () => void }) {
  const [batchRunning, setBatchRunning] = useState<PRAction | null>(null);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });

  const runSingleAction = async (repoPath: string, prNumber: number, action: PRAction) => {
    if (action === 'approve') {
      await invoke<boolean>('approve_pr', { repoPath, prNumber });
      toast.success(`Approved #${prNumber}`);
      return;
    }
    if (action === 'close') {
      await invoke<boolean>('close_pr', { repoPath, prNumber });
      toast.success(`Closed #${prNumber}`);
      return;
    }

    const result = await invoke<{ success: boolean; message: string }>('merge_pr', { repoPath, prNumber });
    if (!result.success) {
      throw new Error(result.message || `Failed to merge #${prNumber}`);
    }
    toast.success(`Merged #${prNumber}`);
  };

  const runSingleActionWithToast = async (repoPath: string, prNumber: number, action: PRAction) => {
    try {
      await runSingleAction(repoPath, prNumber, action);
      onAfterAction();
    } catch (e) {
      toast.error(`Failed ${action} on #${prNumber}: ${String(e)}`);
    }
  };

  const runBatch = async (
    action: PRAction,
    items: Array<{ repoPath: string; prNumber: number }>,
    onComplete: () => void,
  ) => {
    if (items.length === 0) return;

    setBatchRunning(action);
    setBatchProgress({ done: 0, total: items.length });

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      try {
        await runSingleAction(item.repoPath, item.prNumber, action);
      } catch (e) {
        toast.error(`Failed ${action} on #${item.prNumber}: ${String(e)}`);
      } finally {
        setBatchProgress({ done: i + 1, total: items.length });
      }
    }

    toast.success(`Batch ${action} finished (${items.length})`);
    setBatchRunning(null);
    onComplete();
    onAfterAction();
  };

  return { batchRunning, batchProgress, runBatch, runSingleActionWithToast };
}

