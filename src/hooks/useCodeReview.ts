import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import type { ChangedFile, FileDiffData } from "../types";

interface GitIndexChangeEvent {
  repo_path: string;
  worktree_path: string;
}

export type DiffMode = "local" | "branch";

const STORE_PATH = "autopilot-settings.json";
const DIFF_MODE_KEY = "diffMode";

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
  const [diffMode, setDiffMode] = useState<DiffMode>("local");
  const [isInitialized, setIsInitialized] = useState(false);
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
    (async () => {
      try {
        const store = await load(STORE_PATH, { autoSave: true, defaults: {} });
        const savedMode = await store.get<DiffMode>(DIFF_MODE_KEY);
        if (savedMode && (savedMode === "local" || savedMode === "branch")) {
          setDiffMode(savedMode);
        }
      } catch {
        /* empty */
      } finally {
        setIsInitialized(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (isInitialized) {
      fetchChangedFiles();
    }
  }, [fetchChangedFiles, isInitialized]);

  useEffect(() => {
    if (!worktreePath || !isInitialized) return;

    const unlisten = listen<GitIndexChangeEvent>("git-index-changed", (event) => {
      if (event.payload.worktree_path === worktreePath) {
        setDiffCache({});
        fetchChangedFiles();
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [worktreePath, isInitialized, fetchChangedFiles]);

  const refresh = useCallback(() => {
    setDiffCache({});
    fetchChangedFiles();
  }, [fetchChangedFiles]);

  const handleSetDiffMode = useCallback(async (mode: DiffMode) => {
    setDiffMode(mode);
    setDiffCache({});
    try {
      const store = await load(STORE_PATH, { autoSave: true, defaults: {} });
      await store.set(DIFF_MODE_KEY, mode);
      await store.save();
    } catch {
      /* empty */
    }
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
