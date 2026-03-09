import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Repository, WorktreeInfo } from '../../types';

// ── Mocks ─────────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

// Import after mocks
import { useGitWatcher } from '../useGitWatcher';
import { useAppStore } from '../../store';
import { resetStore } from '../../test/helpers/store-helpers';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { mocked, clearAllTimers, waitFor } from '../../test/utils';

// ── Helpers ───────────────────────────────────────────────────────

const mockRepository: Repository = {
  info: {
    path: '/mock/repo1',
    name: 'repo1',
  },
  worktrees: [
    {
      name: 'main',
      path: '/mock/repo1/main',
      branch: 'main',
      last_modified: '2025-01-01T00:00:00Z',
    },
    {
      name: 'feat-1',
      path: '/mock/repo1/feat-1',
      branch: 'feat/test-1',
      last_modified: '2025-01-01T01:00:00Z',
    },
  ],
};

const mockRepository2: Repository = {
  info: {
    path: '/mock/repo2',
    name: 'repo2',
  },
  worktrees: [
    {
      name: 'main',
      path: '/mock/repo2/main',
      branch: 'main',
      last_modified: '2025-01-01T00:00:00Z',
    },
  ],
};

function setupMockStore(repositories: Repository[] = [], isInitialized = true) {
  resetStore();
  useAppStore.setState({
    repositories,
    isInitialized,
    refreshWorktrees: vi.fn().mockResolvedValue(undefined),
    updateWorktreeBranch: vi.fn(),
  });
}

// ── Tests ─────────────────────────────────────────────────────────

describe('useGitWatcher', () => {
  let mockInvoke: ReturnType<typeof vi.fn>;
  let mockListen: ReturnType<typeof vi.fn>;
  let mockUnlistenFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockInvoke = mocked(invoke);
    mockListen = mocked(listen);
    mockUnlistenFn = vi.fn();
    mockListen.mockResolvedValue(mockUnlistenFn);
    
    vi.clearAllMocks();
    setupMockStore();
  });

  afterEach(() => {
    clearAllTimers();
    vi.useRealTimers();
    resetStore();
  });

  describe('initialization', () => {
    it('should not start watching when not initialized', () => {
      setupMockStore([mockRepository], false); // isInitialized = false
      
      renderHook(() => useGitWatcher());

      expect(mockInvoke).not.toHaveBeenCalledWith('start_watching_repository', expect.any(Object));
      expect(mockListen).not.toHaveBeenCalled();
    });

    it('should not start watching when no repositories', () => {
      setupMockStore([], true); // empty repositories, isInitialized = true
      
      renderHook(() => useGitWatcher());

      expect(mockInvoke).not.toHaveBeenCalledWith('start_watching_repository', expect.any(Object));
    });

    it('should start watching when initialized with repositories', async () => {
      setupMockStore([mockRepository]);
      
      renderHook(() => useGitWatcher());

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('start_watching_repository', {
          repoPath: '/mock/repo1',
          worktreePaths: ['/mock/repo1/main', '/mock/repo1/feat-1'],
        });
      });
    });

    it('should start watching multiple repositories', async () => {
      setupMockStore([mockRepository, mockRepository2]);
      
      renderHook(() => useGitWatcher());

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('start_watching_repository', {
          repoPath: '/mock/repo1',
          worktreePaths: ['/mock/repo1/main', '/mock/repo1/feat-1'],
        });
        expect(mockInvoke).toHaveBeenCalledWith('start_watching_repository', {
          repoPath: '/mock/repo2',
          worktreePaths: ['/mock/repo2/main'],
        });
      });
    });
  });

  describe('event listeners', () => {
    it('should set up git-head-changed listener when initialized', async () => {
      setupMockStore([mockRepository]);
      
      renderHook(() => useGitWatcher());

      await waitFor(() => {
        expect(mockListen).toHaveBeenCalledWith('git-head-changed', expect.any(Function));
      });
    });

    it('should set up worktree-changed listener when initialized', async () => {
      setupMockStore([mockRepository]);
      
      renderHook(() => useGitWatcher());

      await waitFor(() => {
        expect(mockListen).toHaveBeenCalledWith('worktree-changed', expect.any(Function));
      });
    });

    it('should not set up listeners when not initialized', () => {
      setupMockStore([mockRepository], false);
      
      renderHook(() => useGitWatcher());

      expect(mockListen).not.toHaveBeenCalled();
    });
  });

  describe('git-head-changed event handling', () => {
    it('should call updateWorktreeBranch with debouncing (300ms)', async () => {
      vi.useFakeTimers();
      const mockUpdateWorktreeBranch = vi.fn();
      setupMockStore([mockRepository]);
      useAppStore.setState({ updateWorktreeBranch: mockUpdateWorktreeBranch });

      renderHook(() => useGitWatcher());

      await waitFor(() => {
        expect(mockListen).toHaveBeenCalledWith('git-head-changed', expect.any(Function));
      });

      // Get the git-head-changed event handler
      const gitHeadListener = mockListen.mock.calls.find(
        call => call[0] === 'git-head-changed'
      )?.[1];
      
      expect(gitHeadListener).toBeDefined();

      // Simulate git-head-changed event
      act(() => {
        gitHeadListener?.({
          payload: {
            repo_path: '/mock/repo1',
            worktree_path: '/mock/repo1/feat-1',
            change_type: 'modified',
          },
        });
      });

      // Should not call immediately
      expect(mockUpdateWorktreeBranch).not.toHaveBeenCalled();

      // Fast-forward 300ms
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(mockUpdateWorktreeBranch).toHaveBeenCalledWith('/mock/repo1/feat-1');
    });

    it('should debounce multiple rapid git-head-changed events', async () => {
      vi.useFakeTimers();
      const mockUpdateWorktreeBranch = vi.fn();
      setupMockStore([mockRepository]);
      useAppStore.setState({ updateWorktreeBranch: mockUpdateWorktreeBranch });

      renderHook(() => useGitWatcher());

      await waitFor(() => {
        expect(mockListen).toHaveBeenCalledWith('git-head-changed', expect.any(Function));
      });

      const gitHeadListener = mockListen.mock.calls.find(
        call => call[0] === 'git-head-changed'
      )?.[1];

      // Simulate rapid events for the same worktree
      act(() => {
        gitHeadListener?.({
          payload: {
            repo_path: '/mock/repo1',
            worktree_path: '/mock/repo1/feat-1',
            change_type: 'modified',
          },
        });
      });

      act(() => {
        vi.advanceTimersByTime(100);
      });

      act(() => {
        gitHeadListener?.({
          payload: {
            repo_path: '/mock/repo1',
            worktree_path: '/mock/repo1/feat-1',
            change_type: 'modified',
          },
        });
      });

      act(() => {
        vi.advanceTimersByTime(100);
      });

      act(() => {
        gitHeadListener?.({
          payload: {
            repo_path: '/mock/repo1',
            worktree_path: '/mock/repo1/feat-1',
            change_type: 'modified',
          },
        });
      });

      // Fast-forward 300ms from the last event
      act(() => {
        vi.advanceTimersByTime(300);
      });

      // Should only be called once (debounced)
      expect(mockUpdateWorktreeBranch).toHaveBeenCalledTimes(1);
      expect(mockUpdateWorktreeBranch).toHaveBeenCalledWith('/mock/repo1/feat-1');
    });
  });

  describe('worktree-changed event handling', () => {
    it('should call refreshWorktrees with debouncing (750ms)', async () => {
      vi.useFakeTimers();
      const mockRefreshWorktrees = vi.fn().mockResolvedValue(undefined);
      setupMockStore([mockRepository]);
      useAppStore.setState({ refreshWorktrees: mockRefreshWorktrees });

      renderHook(() => useGitWatcher());

      await waitFor(() => {
        expect(mockListen).toHaveBeenCalledWith('worktree-changed', expect.any(Function));
      });

      // Get the worktree-changed event handler
      const worktreeListener = mockListen.mock.calls.find(
        call => call[0] === 'worktree-changed'
      )?.[1];
      
      expect(worktreeListener).toBeDefined();

      // Simulate worktree-changed event
      act(() => {
        worktreeListener?.({
          payload: {
            repo_path: '/mock/repo1',
            change_type: 'added',
          },
        });
      });

      // Should not call immediately
      expect(mockRefreshWorktrees).not.toHaveBeenCalled();

      // Fast-forward 750ms
      await act(async () => {
        vi.advanceTimersByTime(750);
        await vi.runAllTicks();
      });

      expect(mockRefreshWorktrees).toHaveBeenCalledWith('/mock/repo1');
    });

    it('should debounce multiple rapid worktree-changed events', async () => {
      vi.useFakeTimers();
      const mockRefreshWorktrees = vi.fn().mockResolvedValue(undefined);
      setupMockStore([mockRepository]);
      useAppStore.setState({ refreshWorktrees: mockRefreshWorktrees });

      renderHook(() => useGitWatcher());

      await waitFor(() => {
        expect(mockListen).toHaveBeenCalledWith('worktree-changed', expect.any(Function));
      });

      const worktreeListener = mockListen.mock.calls.find(
        call => call[0] === 'worktree-changed'
      )?.[1];

      // Simulate rapid events for the same repo
      act(() => {
        worktreeListener?.({
          payload: {
            repo_path: '/mock/repo1',
            change_type: 'added',
          },
        });
      });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      act(() => {
        worktreeListener?.({
          payload: {
            repo_path: '/mock/repo1',
            change_type: 'modified',
          },
        });
      });

      // Fast-forward 750ms from the last event
      await act(async () => {
        vi.advanceTimersByTime(750);
        await vi.runAllTicks();
      });

      // Should only be called once (debounced)
      expect(mockRefreshWorktrees).toHaveBeenCalledTimes(1);
      expect(mockRefreshWorktrees).toHaveBeenCalledWith('/mock/repo1');
    });
  });

  describe('cleanup', () => {
    it('should call unlisten functions and stop_all_watchers on unmount', async () => {
      setupMockStore([mockRepository]);

      const { unmount } = renderHook(() => useGitWatcher());

      // Wait for listeners to be set up
      await waitFor(() => {
        expect(mockListen).toHaveBeenCalledTimes(2);
      });

      // Unmount the hook
      unmount();

      // Should call unlisten functions
      expect(mockUnlistenFn).toHaveBeenCalledTimes(2);

      // Should stop all watchers
      expect(mockInvoke).toHaveBeenCalledWith('stop_all_watchers');
    });

    it('should handle cleanup gracefully when listeners were never set up', () => {
      setupMockStore([mockRepository], false); // not initialized

      const { unmount } = renderHook(() => useGitWatcher());

      // Unmount should not throw
      unmount();

      // Should still try to stop watchers
      expect(mockInvoke).toHaveBeenCalledWith('stop_all_watchers');
    });
  });

  describe('repository changes', () => {
    it('should restart watchers when repositories change', async () => {
      setupMockStore([mockRepository]);

      const { rerender } = renderHook(() => useGitWatcher());

      // Initial call
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('start_watching_repository', {
          repoPath: '/mock/repo1',
          worktreePaths: ['/mock/repo1/main', '/mock/repo1/feat-1'],
        });
      });

      // Clear mocks and add another repository
      mockInvoke.mockClear();
      useAppStore.setState({
        repositories: [mockRepository, mockRepository2],
      });

      rerender();

      // Should call for both repositories
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('start_watching_repository', {
          repoPath: '/mock/repo1',
          worktreePaths: ['/mock/repo1/main', '/mock/repo1/feat-1'],
        });
        expect(mockInvoke).toHaveBeenCalledWith('start_watching_repository', {
          repoPath: '/mock/repo2',
          worktreePaths: ['/mock/repo2/main'],
        });
      });
    });

    it('should restart watchers when worktrees change within a repository', async () => {
      setupMockStore([mockRepository]);

      const { rerender } = renderHook(() => useGitWatcher());

      // Initial call
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('start_watching_repository', {
          repoPath: '/mock/repo1',
          worktreePaths: ['/mock/repo1/main', '/mock/repo1/feat-1'],
        });
      });

      // Clear mocks and modify worktrees
      mockInvoke.mockClear();
      const modifiedRepo: Repository = {
        ...mockRepository,
        worktrees: [
          ...mockRepository.worktrees,
          {
            name: 'feat-2',
            path: '/mock/repo1/feat-2',
            branch: 'feat/test-2',
            last_modified: '2025-01-01T02:00:00Z',
          },
        ],
      };
      useAppStore.setState({
        repositories: [modifiedRepo],
      });

      rerender();

      // Should call with updated worktree paths
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('start_watching_repository', {
          repoPath: '/mock/repo1',
          worktreePaths: ['/mock/repo1/main', '/mock/repo1/feat-1', '/mock/repo1/feat-2'],
        });
      });
    });
  });

  describe('error handling', () => {
    it('should handle invoke errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockInvoke.mockRejectedValueOnce(new Error('Mock invoke error'));
      setupMockStore([mockRepository]);

      expect(() => renderHook(() => useGitWatcher())).not.toThrow();

      consoleSpy.mockRestore();
    });

    it('should handle cleanup invoke errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      setupMockStore([mockRepository]);

      const { unmount } = renderHook(() => useGitWatcher());

      mockInvoke.mockRejectedValueOnce(new Error('Mock cleanup error'));
      unmount();

      consoleSpy.mockRestore();
    });
  });
});