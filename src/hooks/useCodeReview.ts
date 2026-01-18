import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ChangedFile, FileDiffData } from '../types';

interface UseCodeReviewResult {
  changedFiles: ChangedFile[];
  isLoading: boolean;
  error: string | null;
  getDiff: (path: string) => FileDiffData | null;
  loadDiff: (path: string) => Promise<void>;
  isDiffLoading: (path: string) => boolean;
  refresh: () => void;
}

export function useCodeReview(worktreePath: string | null): UseCodeReviewResult {
  const [changedFiles, setChangedFiles] = useState<ChangedFile[]>([]);
  const [diffCache, setDiffCache] = useState<Record<string, FileDiffData>>({});
  const [loadingDiffs, setLoadingDiffs] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const worktreePathRef = useRef(worktreePath);
  worktreePathRef.current = worktreePath;

  const fetchChangedFiles = useCallback(async () => {
    if (!worktreePath) {
      setChangedFiles([]);
      setDiffCache({});
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const files = await invoke<ChangedFile[]>('get_changed_files', {
        worktreePath,
      });
      setChangedFiles(files);
    } catch (e) {
      setError(String(e));
      setChangedFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [worktreePath]);

  const loadDiff = useCallback(async (path: string) => {
    const currentWorktreePath = worktreePathRef.current;
    if (!currentWorktreePath || diffCache[path] || loadingDiffs.has(path)) {
      return;
    }

    setLoadingDiffs((prev) => new Set(prev).add(path));

    try {
      const diff = await invoke<FileDiffData>('get_file_diff', {
        worktreePath: currentWorktreePath,
        filePath: path,
      });
      setDiffCache((prev) => ({ ...prev, [path]: diff }));
    } catch {
      setDiffCache((prev) => ({ ...prev, [path]: { path, patch: '' } }));
    } finally {
      setLoadingDiffs((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  }, [diffCache, loadingDiffs]);

  const getDiff = useCallback((path: string): FileDiffData | null => {
    return diffCache[path] || null;
  }, [diffCache]);

  const isDiffLoading = useCallback((path: string): boolean => {
    return loadingDiffs.has(path);
  }, [loadingDiffs]);

  useEffect(() => {
    fetchChangedFiles();
  }, [fetchChangedFiles]);

  const refresh = useCallback(() => {
    setDiffCache({});
    fetchChangedFiles();
  }, [fetchChangedFiles]);

  return {
    changedFiles,
    isLoading,
    error,
    getDiff,
    loadDiff,
    isDiffLoading,
    refresh,
  };
}
