import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ChangedFile, FileDiffData } from '../types';

interface UseCodeReviewResult {
  changedFiles: ChangedFile[];
  selectedFile: string | null;
  fileDiff: FileDiffData | null;
  isLoading: boolean;
  error: string | null;
  selectFile: (path: string) => void;
  refresh: () => void;
}

export function useCodeReview(worktreePath: string | null): UseCodeReviewResult {
  const [changedFiles, setChangedFiles] = useState<ChangedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<FileDiffData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChangedFiles = useCallback(async () => {
    if (!worktreePath) {
      setChangedFiles([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const files = await invoke<ChangedFile[]>('get_changed_files', {
        worktreePath,
      });
      setChangedFiles(files);
      
      if (files.length > 0 && !selectedFile) {
        setSelectedFile(files[0].path);
      }
    } catch (e) {
      setError(String(e));
      setChangedFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [worktreePath, selectedFile]);

  const fetchFileDiff = useCallback(async () => {
    if (!worktreePath || !selectedFile) {
      setFileDiff(null);
      return;
    }

    try {
      const diff = await invoke<FileDiffData>('get_file_diff', {
        worktreePath,
        filePath: selectedFile,
      });
      setFileDiff(diff);
    } catch (e) {
      setError(String(e));
      setFileDiff(null);
    }
  }, [worktreePath, selectedFile]);

  useEffect(() => {
    fetchChangedFiles();
  }, [fetchChangedFiles]);

  useEffect(() => {
    fetchFileDiff();
  }, [fetchFileDiff]);

  const selectFile = useCallback((path: string) => {
    setSelectedFile(path);
  }, []);

  const refresh = useCallback(() => {
    setSelectedFile(null);
    fetchChangedFiles();
  }, [fetchChangedFiles]);

  return {
    changedFiles,
    selectedFile,
    fileDiff,
    isLoading,
    error,
    selectFile,
    refresh,
  };
}
