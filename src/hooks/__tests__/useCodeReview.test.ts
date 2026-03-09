import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCodeReview } from '../useCodeReview';
import type { ChangedFile, FileDiffData } from '../../types';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { load } from '@tauri-apps/plugin-store';
import { mocked, createMockStore } from '../../test/utils';

// Test Data
const mockChangedFiles: ChangedFile[] = [
  {
    path: 'src/components/Button.tsx',
    status: 'modified',
    additions: 10,
    deletions: 2,
  },
  {
    path: 'src/utils/helpers.ts', 
    status: 'added',
    additions: 25,
    deletions: 0,
  },
];

const mockBranchChangedFiles: ChangedFile[] = [
  {
    path: 'src/components/Header.tsx',
    status: 'modified',
    additions: 5,
    deletions: 1,
  },
];

const mockFileDiff: FileDiffData = {
  path: 'src/components/Button.tsx',
  patch: '@@ -1,3 +1,4 @@\n import React from "react";\n+import { cn } from "../utils";\n \n export function Button() {',
  old_content: 'import React from "react";\n\nexport function Button() {',
  new_content: 'import React from "react";\nimport { cn } from "../utils";\n\nexport function Button() {',
};

describe('useCodeReview', () => {
  let mockInvoke: any;
  let mockListen: any;
  let mockLoad: any;
  let mockStore: any;
  let mockUnlisten: any;

  beforeEach(() => {
    mockInvoke = mocked(invoke);
    mockListen = mocked(listen);
    mockLoad = mocked(load);
    mockStore = createMockStore();
    mockUnlisten = vi.fn();

    // Reset all mocks
    vi.clearAllMocks();

    // Setup default mock implementations
    mockInvoke.mockResolvedValue(mockChangedFiles);
    mockListen.mockImplementation(() => Promise.resolve(mockUnlisten));
    mockLoad.mockResolvedValue(mockStore);
    mockStore.get.mockResolvedValue(undefined);
    mockStore.set.mockResolvedValue(undefined);
    mockStore.save.mockResolvedValue(undefined);
  });

  describe('when worktreePath is null', () => {
    it('returns empty changedFiles and clears diff cache', async () => {
      const { result } = renderHook(() => useCodeReview(null));

      await waitFor(() => {
        expect(result.current.changedFiles).toEqual([]);
      });

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('returns null for getDiff when worktreePath is null', async () => {
      const { result } = renderHook(() => useCodeReview(null));

      await waitFor(() => {
        expect(result.current.getDiff('any-path')).toBeNull();
      });
    });
  });

  describe('fetching changed files', () => {
    it('fetches uncommitted files in local mode', async () => {
      const { result } = renderHook(() => useCodeReview('/test/repo'));

      await waitFor(() => {
        expect(result.current.changedFiles).toEqual(mockChangedFiles);
      });

      expect(mockInvoke).toHaveBeenCalledWith('get_uncommitted_files', {
        worktreePath: '/test/repo',
      });
    });

    it('fetches changed files in branch mode', async () => {
      mockStore.get.mockResolvedValue('branch');
      mockInvoke.mockResolvedValue(mockBranchChangedFiles);

      const { result } = renderHook(() => useCodeReview('/test/repo'));

      await waitFor(() => {
        expect(result.current.diffMode).toBe('branch');
        expect(result.current.changedFiles).toEqual(mockBranchChangedFiles);
      });

      expect(mockInvoke).toHaveBeenCalledWith('get_changed_files', {
        worktreePath: '/test/repo',
      });
    });

    it('defaults to local mode when no saved diffMode', async () => {
      mockStore.get.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCodeReview('/test/repo'));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('get_uncommitted_files', {
          worktreePath: '/test/repo',
        });
      });

      expect(result.current.diffMode).toBe('local');
    });

    it('handles fetch failure gracefully', async () => {
      const error = new Error('Git command failed');
      mockInvoke.mockRejectedValue(error);

      const { result } = renderHook(() => useCodeReview('/test/repo'));

      await waitFor(() => {
        expect(result.current.error).toBe('Error: Git command failed');
        expect(result.current.changedFiles).toEqual([]);
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('sets loading state during fetch', async () => {
      let resolvePromise: any;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockInvoke.mockReturnValue(promise);

      const { result } = renderHook(() => useCodeReview('/test/repo'));

      // Should be loading initially (after initialization)
      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      // Complete the promise
      act(() => {
        resolvePromise(mockChangedFiles);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.changedFiles).toEqual(mockChangedFiles);
      });
    });
  });

  describe('diff caching and loading', () => {
    it('loadDiff caches diff data', async () => {
      mockInvoke
        .mockResolvedValueOnce(mockChangedFiles) // for fetchChangedFiles
        .mockResolvedValueOnce(mockFileDiff); // for loadDiff

      const { result } = renderHook(() => useCodeReview('/test/repo'));

      await waitFor(() => {
        expect(result.current.changedFiles).toEqual(mockChangedFiles);
      });

      await act(async () => {
        await result.current.loadDiff('src/components/Button.tsx');
      });

      expect(result.current.getDiff('src/components/Button.tsx')).toEqual(mockFileDiff);
      expect(mockInvoke).toHaveBeenCalledWith('get_uncommitted_diff', {
        worktreePath: '/test/repo',
        filePath: 'src/components/Button.tsx',
      });
    });

    it('getDiff returns cached diff or null', async () => {
      const { result } = renderHook(() => useCodeReview('/test/repo'));

      await waitFor(() => {
        expect(result.current.getDiff('nonexistent')).toBeNull();
      });

      mockInvoke.mockResolvedValueOnce(mockFileDiff);

      await act(async () => {
        await result.current.loadDiff('src/components/Button.tsx');
      });

      expect(result.current.getDiff('src/components/Button.tsx')).toEqual(mockFileDiff);
    });

    it('isDiffLoading tracks loading state per file', async () => {
      let resolvePromise: any;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      
      mockInvoke
        .mockResolvedValueOnce(mockChangedFiles) // for fetchChangedFiles
        .mockReturnValueOnce(promise); // for loadDiff

      const { result } = renderHook(() => useCodeReview('/test/repo'));

      await waitFor(() => {
        expect(result.current.changedFiles).toEqual(mockChangedFiles);
      });

      // Start loading diff
      act(() => {
        result.current.loadDiff('src/components/Button.tsx');
      });

      await waitFor(() => {
        expect(result.current.isDiffLoading('src/components/Button.tsx')).toBe(true);
      });

      // Complete loading
      act(() => {
        resolvePromise(mockFileDiff);
      });

      await waitFor(() => {
        expect(result.current.isDiffLoading('src/components/Button.tsx')).toBe(false);
      });
    });

    it('skips loading diff if already cached', async () => {
      mockInvoke
        .mockResolvedValueOnce(mockChangedFiles) // for fetchChangedFiles
        .mockResolvedValueOnce(mockFileDiff); // for first loadDiff

      const { result } = renderHook(() => useCodeReview('/test/repo'));

      await waitFor(() => {
        expect(result.current.changedFiles).toEqual(mockChangedFiles);
      });

      // Load diff first time
      await act(async () => {
        await result.current.loadDiff('src/components/Button.tsx');
      });

      const callCountAfterFirstLoad = mockInvoke.mock.calls.length;

      // Try to load same diff again
      await act(async () => {
        await result.current.loadDiff('src/components/Button.tsx');
      });

      // Should not make additional invoke calls
      expect(mockInvoke.mock.calls.length).toBe(callCountAfterFirstLoad);
    });

    it('skips loading diff if already loading', async () => {
      let resolvePromise: any;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      
      mockInvoke
        .mockResolvedValueOnce(mockChangedFiles) // for fetchChangedFiles
        .mockReturnValue(promise); // for loadDiff calls

      const { result } = renderHook(() => useCodeReview('/test/repo'));

      await waitFor(() => {
        expect(result.current.changedFiles).toEqual(mockChangedFiles);
      });

      // Start first load
      act(() => {
        result.current.loadDiff('src/components/Button.tsx');
      });

      // Try to start second load while first is still in progress
      act(() => {
        result.current.loadDiff('src/components/Button.tsx');
      });

      // Complete the loading
      act(() => {
        resolvePromise(mockFileDiff);
      });

      await waitFor(() => {
        expect(result.current.isDiffLoading('src/components/Button.tsx')).toBe(false);
      });

      // Should only have been called once for loadDiff (plus once for fetchChangedFiles)
      expect(mockInvoke.mock.calls.filter((call: any) => call[0] === 'get_uncommitted_diff')).toHaveLength(1);
    });

    it('handles diff loading failure gracefully', async () => {
      const error = new Error('Diff loading failed');
      mockInvoke
        .mockResolvedValueOnce(mockChangedFiles) // for fetchChangedFiles
        .mockRejectedValueOnce(error); // for loadDiff

      const { result } = renderHook(() => useCodeReview('/test/repo'));

      await waitFor(() => {
        expect(result.current.changedFiles).toEqual(mockChangedFiles);
      });

      await act(async () => {
        await result.current.loadDiff('src/components/Button.tsx');
      });

      // Should have empty patch in cache on failure
      const cachedDiff = result.current.getDiff('src/components/Button.tsx');
      expect(cachedDiff).toEqual({
        path: 'src/components/Button.tsx',
        patch: '',
      });
    });

    it('uses correct command for diff loading based on diffMode', async () => {
      mockStore.get.mockResolvedValue('branch');
      mockInvoke
        .mockResolvedValueOnce(mockBranchChangedFiles) // for fetchChangedFiles
        .mockResolvedValueOnce(mockFileDiff); // for loadDiff

      const { result } = renderHook(() => useCodeReview('/test/repo'));

      await waitFor(() => {
        expect(result.current.diffMode).toBe('branch');
        expect(result.current.changedFiles).toEqual(mockBranchChangedFiles);
      });

      await act(async () => {
        await result.current.loadDiff('src/components/Header.tsx');
      });

      expect(mockInvoke).toHaveBeenCalledWith('get_file_diff', {
        worktreePath: '/test/repo',
        filePath: 'src/components/Header.tsx',
      });
    });
  });

  describe('refresh functionality', () => {
    it('refresh clears cache and refetches files', async () => {
      mockInvoke
        .mockResolvedValueOnce(mockChangedFiles) // initial fetch
        .mockResolvedValueOnce(mockFileDiff) // loadDiff
        .mockResolvedValueOnce(mockBranchChangedFiles); // refresh fetch

      const { result } = renderHook(() => useCodeReview('/test/repo'));

      await waitFor(() => {
        expect(result.current.changedFiles).toEqual(mockChangedFiles);
      });

      // Load a diff to populate cache
      await act(async () => {
        await result.current.loadDiff('src/components/Button.tsx');
      });

      expect(result.current.getDiff('src/components/Button.tsx')).toEqual(mockFileDiff);

      // Refresh
      await act(async () => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.changedFiles).toEqual(mockBranchChangedFiles);
      });

      // Cache should be cleared
      expect(result.current.getDiff('src/components/Button.tsx')).toBeNull();
    });
  });

  describe('setDiffMode functionality', () => {
    it('setDiffMode persists to store and clears cache', async () => {
      mockInvoke
        .mockResolvedValueOnce(mockChangedFiles) // initial fetch in local mode
        .mockResolvedValueOnce(mockFileDiff) // loadDiff
        .mockResolvedValueOnce(mockBranchChangedFiles); // fetch in branch mode

      const { result } = renderHook(() => useCodeReview('/test/repo'));

      await waitFor(() => {
        expect(result.current.changedFiles).toEqual(mockChangedFiles);
        expect(result.current.diffMode).toBe('local');
      });

      // Load a diff to populate cache
      await act(async () => {
        await result.current.loadDiff('src/components/Button.tsx');
      });

      expect(result.current.getDiff('src/components/Button.tsx')).toEqual(mockFileDiff);

      // Change mode
      await act(async () => {
        await result.current.setDiffMode('branch');
      });

      await waitFor(() => {
        expect(result.current.diffMode).toBe('branch');
        expect(result.current.changedFiles).toEqual(mockBranchChangedFiles);
      });

      // Cache should be cleared
      expect(result.current.getDiff('src/components/Button.tsx')).toBeNull();

      // Should have persisted to store
      expect(mockStore.set).toHaveBeenCalledWith('diffMode', 'branch');
      expect(mockStore.save).toHaveBeenCalled();
    });

    it('handles store persistence failure gracefully', async () => {
      const error = new Error('Store save failed');
      mockStore.save.mockRejectedValue(error);

      const { result } = renderHook(() => useCodeReview('/test/repo'));

      await waitFor(() => {
        expect(result.current.diffMode).toBe('local');
      });

      // Should not throw error even if store fails
      await act(async () => {
        await result.current.setDiffMode('branch');
      });

      expect(result.current.diffMode).toBe('branch');
    });
  });

  describe('git-index-changed event listener', () => {
    it('listens for git-index-changed events and refreshes on match', async () => {
      let eventCallback: any;
      mockListen.mockImplementation((eventName: any, callback: any) => {
        if (eventName === 'git-index-changed') {
          eventCallback = callback;
        }
        return Promise.resolve(mockUnlisten);
      });

      mockInvoke
        .mockResolvedValueOnce(mockChangedFiles) // initial fetch
        .mockResolvedValueOnce(mockBranchChangedFiles); // refresh fetch

      const { result } = renderHook(() => useCodeReview('/test/repo'));

      await waitFor(() => {
        expect(result.current.changedFiles).toEqual(mockChangedFiles);
        expect(mockListen).toHaveBeenCalledWith('git-index-changed', expect.any(Function));
      });

      // Trigger git-index-changed event
      act(() => {
        eventCallback({
          payload: {
            repo_path: '/test/repo',
            worktree_path: '/test/repo',
          },
        });
      });

      await waitFor(() => {
        expect(result.current.changedFiles).toEqual(mockBranchChangedFiles);
      });
    });

    it('does not refresh on git-index-changed for different worktree', async () => {
      let eventCallback: any;
      mockListen.mockImplementation((eventName: any, callback: any) => {
        if (eventName === 'git-index-changed') {
          eventCallback = callback;
        }
        return Promise.resolve(mockUnlisten);
      });

      const { result } = renderHook(() => useCodeReview('/test/repo'));

      await waitFor(() => {
        expect(result.current.changedFiles).toEqual(mockChangedFiles);
      });

      const callCountBeforeEvent = mockInvoke.mock.calls.length;

      // Trigger git-index-changed event for different worktree
      act(() => {
        eventCallback({
          payload: {
            repo_path: '/test/repo',
            worktree_path: '/different/repo',
          },
        });
      });

      // Wait a bit to ensure no refresh happens
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not have made additional calls
      expect(mockInvoke.mock.calls.length).toBe(callCountBeforeEvent);
    });

    it('only clears cache on git-index-changed in local mode', async () => {
      let eventCallback: any;
      mockListen.mockImplementation((eventName: any, callback: any) => {
        if (eventName === 'git-index-changed') {
          eventCallback = callback;
        }
        return Promise.resolve(mockUnlisten);
      });

      mockStore.get.mockResolvedValue('branch');
      mockInvoke
        .mockResolvedValueOnce(mockBranchChangedFiles) // initial fetch
        .mockResolvedValueOnce(mockFileDiff) // loadDiff
        .mockResolvedValueOnce(mockChangedFiles); // refresh fetch

      const { result } = renderHook(() => useCodeReview('/test/repo'));

      await waitFor(() => {
        expect(result.current.diffMode).toBe('branch');
        expect(result.current.changedFiles).toEqual(mockBranchChangedFiles);
      });

      // Load a diff to populate cache
      await act(async () => {
        await result.current.loadDiff('src/components/Header.tsx');
      });

      expect(result.current.getDiff('src/components/Header.tsx')).toEqual(mockFileDiff);

      // Trigger git-index-changed event
      act(() => {
        eventCallback({
          payload: {
            repo_path: '/test/repo',
            worktree_path: '/test/repo',
          },
        });
      });

      await waitFor(() => {
        expect(result.current.changedFiles).toEqual(mockChangedFiles);
      });

      // In branch mode, cache should NOT be cleared automatically
      expect(result.current.getDiff('src/components/Header.tsx')).toEqual(mockFileDiff);
    });

    it('unsubscribes from event listener on unmount', async () => {
      const { unmount } = renderHook(() => useCodeReview('/test/repo'));

      await waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });

      unmount();

      await waitFor(() => {
        expect(mockUnlisten).toHaveBeenCalled();
      });
    });

    it('does not set up listener when worktreePath is null', async () => {
      renderHook(() => useCodeReview(null));

      // Wait a bit to ensure initialization
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockListen).not.toHaveBeenCalled();
    });
  });

  describe('initialization and saved state', () => {
    it('loads saved diffMode from store on mount', async () => {
      mockStore.get.mockResolvedValue('branch');

      const { result } = renderHook(() => useCodeReview('/test/repo'));

      await waitFor(() => {
        expect(result.current.diffMode).toBe('branch');
      });

      expect(mockLoad).toHaveBeenCalledWith('autopilot-settings.json', {
        autoSave: true,
        defaults: {},
      });
      expect(mockStore.get).toHaveBeenCalledWith('diffMode');
    });

    it('handles store load failure gracefully', async () => {
      const error = new Error('Store load failed');
      mockLoad.mockRejectedValue(error);

      const { result } = renderHook(() => useCodeReview('/test/repo'));

      await waitFor(() => {
        expect(result.current.diffMode).toBe('local'); // fallback to default
      });
    });

    it('ignores invalid saved diffMode values', async () => {
      mockStore.get.mockResolvedValue('invalid-mode');

      const { result } = renderHook(() => useCodeReview('/test/repo'));

      await waitFor(() => {
        expect(result.current.diffMode).toBe('local'); // fallback to default
      });
    });

    it('does not fetch files before initialization', async () => {
      // Delay store loading to test initialization timing
      let resolveStore: any;
      const storePromise = new Promise((resolve) => {
        resolveStore = resolve;
      });
      mockLoad.mockReturnValue(storePromise);

      renderHook(() => useCodeReview('/test/repo'));

      // Should not fetch files yet
      expect(mockInvoke).not.toHaveBeenCalled();

      // Complete initialization
      act(() => {
        resolveStore(mockStore);
      });

      // Now should fetch files
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('get_uncommitted_files', {
          worktreePath: '/test/repo',
        });
      });
    });
  });
});