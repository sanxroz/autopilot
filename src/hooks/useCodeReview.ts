import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ChangedFile, FileDiffData } from "../types";

export type DiffMode = "local" | "branch";

interface UseCodeReviewResult {
  changedFiles: ChangedFile[];
  isLoading: boolean;
  error: string | null;
  getDiff: (path: string) => FileDiffData | null;
  loadDiff: (path: string) => Promise<void>;
  isDiffLoading: (path: string) => boolean;
  refresh: () => void;
  diffMode: DiffMode;
  setDiffMode: (mode: DiffMode) => void;
}

export function useCodeReview(
  worktreePath: string | null,
): UseCodeReviewResult {
  const [diffMode, setDiffMode] = useState<DiffMode>("branch");
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
      const command =
        diffMode === "local" ? "get_uncommitted_files" : "get_changed_files";
      const files = await invoke<ChangedFile[]>(command, {
        worktreePath,
      });
      setChangedFiles(files);
    } catch (e) {
      setError(String(e));
      setChangedFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [worktreePath, diffMode]);

  const loadDiff = useCallback(
    async (path: string) => {
      const currentWorktreePath = worktreePathRef.current;
      if (!currentWorktreePath || diffCache[path] || loadingDiffs.has(path)) {
        return;
      }

      setLoadingDiffs((prev) => new Set(prev).add(path));

      try {
        const command =
          diffMode === "local" ? "get_uncommitted_diff" : "get_file_diff";
        const diff = await invoke<FileDiffData>(command, {
          worktreePath: currentWorktreePath,
          filePath: path,
        });
        setDiffCache((prev) => ({ ...prev, [path]: diff }));
      } catch {
        setDiffCache((prev) => ({ ...prev, [path]: { path, patch: "" } }));
      } finally {
        setLoadingDiffs((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      }
    },
    [diffCache, loadingDiffs, diffMode],
  );

  const getDiff = useCallback(
    (path: string): FileDiffData | null => {
      return diffCache[path] || null;
    },
    [diffCache],
  );

  const isDiffLoading = useCallback(
    (path: string): boolean => {
      return loadingDiffs.has(path);
    },
    [loadingDiffs],
  );

  useEffect(() => {
    fetchChangedFiles();
  }, [fetchChangedFiles]);

  const refresh = useCallback(() => {
    setDiffCache({});
    fetchChangedFiles();
  }, [fetchChangedFiles]);

  const handleSetDiffMode = useCallback((mode: DiffMode) => {
    setDiffMode(mode);
    setDiffCache({});
  }, []);

  return {
    changedFiles,
    isLoading,
    error,
    getDiff,
    loadDiff,
    isDiffLoading,
    refresh,
    diffMode,
    setDiffMode: handleSetDiffMode,
  };
}
