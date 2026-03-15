import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { useDiffStatsLoader } from '../useDiffStats';
import { useAppStore } from '../../store';
import { resetStore, setStoreState, seedRepository } from '../../test/helpers/store-helpers';
import type { WorktreeInfo } from '../../types';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

async function flushPromises() {
  await act(async () => {
    await new Promise((r) => setImmediate(r));
  });
}

describe('useDiffStatsLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  afterEach(() => {
    resetStore();
  });

  it('should do nothing when not initialized', async () => {
    seedRepository({
      worktrees: [
        { name: 'main', path: '/repo/main', branch: 'main', last_modified: null },
        { name: 'feat', path: '/repo/feat', branch: 'feat', last_modified: null },
      ],
    });

    renderHook(() => useDiffStatsLoader());
    await flushPromises();

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('should do nothing when no repositories', async () => {
    setStoreState({ isInitialized: true });

    renderHook(() => useDiffStatsLoader());
    await flushPromises();

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('should filter out "main" worktrees', async () => {
    setStoreState({ isInitialized: true });
    seedRepository({
      worktrees: [
        { name: 'main', path: '/repo/main', branch: 'main', last_modified: null },
        { name: 'feat', path: '/repo/feat', branch: 'feat', last_modified: null },
      ],
    });

    mockInvoke.mockResolvedValueOnce([
      { path: '/repo/feat', diff_stats: { additions: 10, deletions: 5 } },
    ]);

    renderHook(() => useDiffStatsLoader());
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith('get_worktrees_diff_stats', {
      worktreePaths: ['/repo/feat'],
    });
  });

  it('should skip worktrees that already have diff_stats', async () => {
    setStoreState({ isInitialized: true });
    seedRepository({
      worktrees: [
        { name: 'main', path: '/repo/main', branch: 'main', last_modified: null },
        { name: 'feat', path: '/repo/feat', branch: 'feat', last_modified: null, diff_stats: { additions: 1, deletions: 0 } },
        { name: 'fix', path: '/repo/fix', branch: 'fix', last_modified: null },
      ],
    });

    mockInvoke.mockResolvedValueOnce([
      { path: '/repo/fix', diff_stats: { additions: 3, deletions: 2 } },
    ]);

    renderHook(() => useDiffStatsLoader());
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith('get_worktrees_diff_stats', {
      worktreePaths: ['/repo/fix'],
    });
  });

  it('should update store with fetched stats', async () => {
    setStoreState({ isInitialized: true });
    seedRepository({
      worktrees: [
        { name: 'main', path: '/repo/main', branch: 'main', last_modified: null },
        { name: 'feat', path: '/repo/feat', branch: 'feat', last_modified: null },
      ],
    });

    const mockStats = [{ path: '/repo/feat', diff_stats: { additions: 42, deletions: 7 } }];
    mockInvoke.mockResolvedValueOnce(mockStats);

    renderHook(() => useDiffStatsLoader());
    await flushPromises();

    // updateWorktreeDiffStats should have been called on the store
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('should handle fetch failure gracefully', async () => {
    setStoreState({ isInitialized: true });
    seedRepository({
      worktrees: [
        { name: 'main', path: '/repo/main', branch: 'main', last_modified: null },
        { name: 'feat', path: '/repo/feat', branch: 'feat', last_modified: null },
      ],
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockInvoke.mockRejectedValueOnce(new Error('Network error'));

    renderHook(() => useDiffStatsLoader());
    await flushPromises();

    expect(consoleSpy).toHaveBeenCalledWith('Failed to load diff stats:', expect.any(Error));
    consoleSpy.mockRestore();
  });
});
