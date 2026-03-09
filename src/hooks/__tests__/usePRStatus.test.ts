import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { usePRStatusPolling, usePRStatusForBranch } from '../usePRStatus';
import { useAppStore } from '../../store';
import { resetStore, setStoreState, seedRepository, seedGitHubSettings } from '../../test/helpers/store-helpers';
import type { PRStatus, RepoPRStatuses } from '../../types/github';
import type { WorktreeInfo } from '../../types';

// ── Mocks ─────────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

// ── Test Data ──────────────────────────────────────────────────────

const mockPRStatus: PRStatus = {
  number: 123,
  title: 'Add new feature',
  url: 'https://github.com/test/repo/pull/123',
  state: 'open',
  merged: false,
  draft: false,
  review_decision: 'APPROVED',
  checks_status: 'success',
  additions: 50,
  deletions: 10,
  head_branch: 'feature-branch',
};

const mockRepoPRStatuses: RepoPRStatuses[] = [
  {
    repo_path: '/test/repo',
    statuses: [mockPRStatus],
  },
];

const mockWorktrees: WorktreeInfo[] = [
  {
    name: 'main',
    path: '/test/repo/main',
    branch: 'main',
    last_modified: '2025-01-01T00:00:00Z',
  },
  {
    name: 'feature-branch',
    path: '/test/repo/feature',
    branch: 'feature-branch',
    last_modified: '2025-01-02T00:00:00Z',
  },
];

// ── Helpers ────────────────────────────────────────────────────────

function setupPollingTest() {
  resetStore();
  seedGitHubSettings({ ghCliAvailable: true, pollingIntervalMs: 100 });
  seedRepository({
    repoPath: '/test/repo',
    repoName: 'test-repo',
    worktrees: mockWorktrees,
  });
}

/** Flush microtask queue so resolved promises run */
async function flushPromises() {
  await act(async () => {
    await new Promise((r) => setImmediate(r));
  });
}

// ── Tests ──────────────────────────────────────────────────────────

describe('usePRStatusPolling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetStore();
  });

  it('should fetch PR statuses when GitHub CLI is available', async () => {
    setupPollingTest();
    mockInvoke.mockResolvedValueOnce(mockRepoPRStatuses);

    renderHook(() => usePRStatusPolling());

    // Let the initial fetch complete
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith('get_all_prs_for_repos', {
      repos: [
        {
          repo_path: '/test/repo',
          branches: ['feature-branch'],
        },
      ],
    });

    const store = useAppStore.getState();
    expect(store.prStatusByBranch['/test/repo']['feature-branch']).toEqual(mockPRStatus);
  });

  it('should not fetch when GitHub CLI is not available', async () => {
    resetStore();
    seedGitHubSettings({ ghCliAvailable: false });
    seedRepository({ worktrees: mockWorktrees });

    renderHook(() => usePRStatusPolling());

    await flushPromises();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('should not fetch when no repositories exist', async () => {
    resetStore();
    seedGitHubSettings({ ghCliAvailable: true });

    renderHook(() => usePRStatusPolling());

    await flushPromises();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('should filter out collapsed repositories', async () => {
    setupPollingTest();
    setStoreState({ collapsedRepos: new Set(['/test/repo']) });

    renderHook(() => usePRStatusPolling());

    await flushPromises();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('should exclude main/master branches from polling', async () => {
    resetStore();
    seedGitHubSettings({ ghCliAvailable: true, pollingIntervalMs: 30000 });
    const worktreesWithMaster: WorktreeInfo[] = [
      ...mockWorktrees,
      { name: 'master', path: '/test/repo/master', branch: 'master', last_modified: '2025-01-03T00:00:00Z' },
    ];
    seedRepository({ repoPath: '/test/repo', worktrees: worktreesWithMaster });
    mockInvoke.mockResolvedValueOnce([]);

    renderHook(() => usePRStatusPolling());

    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith('get_all_prs_for_repos', {
      repos: [{ repo_path: '/test/repo', branches: ['feature-branch'] }],
    });
  });

  it('should handle API errors gracefully', async () => {
    setupPollingTest();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockInvoke.mockRejectedValueOnce(new Error('API error'));

    renderHook(() => usePRStatusPolling());

    await flushPromises();

    expect(consoleSpy).toHaveBeenCalledWith('Failed to fetch PRs:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('should clean up interval on unmount', async () => {
    setupPollingTest();
    mockInvoke.mockResolvedValue([]);

    const { unmount } = renderHook(() => usePRStatusPolling());

    await flushPromises();
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    unmount();
    // No error on cleanup = interval cleared
  });

  it('should return refresh function', async () => {
    setupPollingTest();
    mockInvoke.mockResolvedValue(mockRepoPRStatuses);

    const { result } = renderHook(() => usePRStatusPolling());

    await flushPromises();
    expect(result.current.refresh).toBeInstanceOf(Function);

    mockInvoke.mockClear();
    mockInvoke.mockResolvedValueOnce(mockRepoPRStatuses);

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockInvoke).toHaveBeenCalledWith('get_all_prs_for_repos', expect.any(Object));
  });
});

describe('usePRStatusForBranch', () => {
  beforeEach(() => {
    resetStore();
  });

  it('should return null when branch is null', () => {
    const { result } = renderHook(() => usePRStatusForBranch('/test/repo', null));
    expect(result.current).toBeNull();
  });

  it('should return null when repo has no PR statuses', () => {
    const { result } = renderHook(() => usePRStatusForBranch('/test/repo', 'feature-branch'));
    expect(result.current).toBeNull();
  });

  it('should return null when branch not found in repo statuses', () => {
    setStoreState({
      prStatusByBranch: { '/test/repo': { 'other-branch': mockPRStatus } },
    });
    const { result } = renderHook(() => usePRStatusForBranch('/test/repo', 'feature-branch'));
    expect(result.current).toBeNull();
  });

  it('should return PR status for existing branch', () => {
    setStoreState({
      prStatusByBranch: { '/test/repo': { 'feature-branch': mockPRStatus } },
    });
    const { result } = renderHook(() => usePRStatusForBranch('/test/repo', 'feature-branch'));
    expect(result.current).toEqual(mockPRStatus);
  });

  it('should update when store changes', () => {
    const { result, rerender } = renderHook(() =>
      usePRStatusForBranch('/test/repo', 'feature-branch')
    );
    expect(result.current).toBeNull();

    act(() => {
      setStoreState({
        prStatusByBranch: { '/test/repo': { 'feature-branch': mockPRStatus } },
      });
    });
    rerender();
    expect(result.current).toEqual(mockPRStatus);
  });

  it('should work with multiple repos and branches', () => {
    const secondPRStatus: PRStatus = { ...mockPRStatus, number: 456, head_branch: 'another-feature' };
    setStoreState({
      prStatusByBranch: {
        '/test/repo1': { 'feature-branch': mockPRStatus },
        '/test/repo2': { 'another-feature': secondPRStatus },
      },
    });

    const { result: r1 } = renderHook(() => usePRStatusForBranch('/test/repo1', 'feature-branch'));
    expect(r1.current).toEqual(mockPRStatus);

    const { result: r2 } = renderHook(() => usePRStatusForBranch('/test/repo2', 'another-feature'));
    expect(r2.current).toEqual(secondPRStatus);

    const { result: r3 } = renderHook(() => usePRStatusForBranch('/test/repo1', 'another-feature'));
    expect(r3.current).toBeNull();
  });
});
