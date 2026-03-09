import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../store';
import { resetStore, seedRepository, setStoreState } from '../helpers/store-helpers';
import type { WorktreeInfo, RepoInfo } from '../../types';

/**
 * Integration tests: verify that store actions invoke the correct Tauri commands
 * with expected payloads.
 */

const { mockStoreInstance } = vi.hoisted(() => {
  const mockStoreInstance = {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
  };
  return { mockStoreInstance };
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn().mockResolvedValue(mockStoreInstance),
}));

vi.mock('../../theme', () => ({
  setThemeMode: vi.fn(),
  getThemeMode: vi.fn(() => 'dark'),
  toggleThemeMode: vi.fn(),
  subscribeTheme: vi.fn(),
  initializeTheme: vi.fn(),
  getTheme: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

const mockRepoInfo: RepoInfo = { path: '/test/repo', name: 'test-repo' };
const mockWorktrees: WorktreeInfo[] = [
  { name: 'main', path: '/test/repo/main', branch: 'main', last_modified: null },
  { name: 'feat', path: '/test/repo/feat', branch: 'feature', last_modified: null },
];

describe('Tauri Command Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it('addRepository invokes discover_repository then list_worktrees', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'discover_repository') return mockRepoInfo;
      if (cmd === 'list_worktrees') return mockWorktrees;
      if (cmd === 'get_repo_from_remote') return 'owner/repo';
      if (cmd === 'spawn_terminal') return { terminal_id: 'term-1' };
      if (cmd === 'check_gh_cli') return true;
      if (cmd === 'check_gh_auth') return 'user';
      if (cmd === 'start_watching_repository') return undefined;
      if (cmd === 'get_worktree_branch_name') return 'main';
      return undefined;
    });

    // Initialize store first
    setStoreState({ isInitialized: true });
    await useAppStore.getState().addRepository('/test/repo');

    const calls = mockInvoke.mock.calls.map((c) => c[0]);
    expect(calls).toContain('discover_repository');
    expect(calls).toContain('list_worktrees');

    // Verify discover_repository was called with correct args
    expect(mockInvoke).toHaveBeenCalledWith('discover_repository', { path: '/test/repo' });
  });

  it('refreshWorktrees invokes list_worktrees with repo path', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'list_worktrees') return mockWorktrees;
      return undefined;
    });

    seedRepository({ repoPath: '/test/repo' });
    await useAppStore.getState().refreshWorktrees('/test/repo');

    expect(mockInvoke).toHaveBeenCalledWith('list_worktrees', { repoPath: '/test/repo' });
  });

  it('selectWorktree invokes spawn_terminal with the worktree path', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'spawn_terminal') return { terminal_id: 'term-123' };
      return undefined;
    });

    const targetWorktree = mockWorktrees[1]!;

    await useAppStore.getState().selectWorktree(targetWorktree);

    expect(mockInvoke).toHaveBeenCalledWith('spawn_terminal', {
      cwd: targetWorktree.path,
      cols: 80,
      rows: 24,
      isDarkMode: true,
    });

    const state = useAppStore.getState();
    expect(state.selectedWorktree).toEqual(targetWorktree);
    expect(state.currentTerminals).toEqual([
      {
        id: 'term-123',
        worktreePath: targetWorktree.path,
        worktreeName: targetWorktree.name,
      },
    ]);
  });

  it('deleteWorktree closes terminals before deleting the worktree', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'close_terminals_for_worktree') return 1;
      if (cmd === 'delete_worktree') return undefined;
      if (cmd === 'list_worktrees') return [mockWorktrees[0]]; // only main after delete
      return undefined;
    });

    seedRepository({ repoPath: '/test/repo', worktrees: mockWorktrees });
    await useAppStore.getState().deleteWorktree('/test/repo', 'feat');

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'close_terminals_for_worktree', {
      worktreePath: '/test/repo/feat',
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'delete_worktree', {
      repoPath: '/test/repo',
      worktreeName: 'feat',
      force: true,
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(3, 'list_worktrees', {
      repoPath: '/test/repo',
    });
  });

  it('createWorktreeAuto invokes create_worktree_auto', async () => {
    const newWorktree: WorktreeInfo = {
      name: 'new-wt',
      path: '/test/repo/new-wt',
      branch: 'new-branch',
      last_modified: null,
    };

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'create_worktree_auto') return newWorktree;
      if (cmd === 'list_worktrees') return [...mockWorktrees, newWorktree];
      return undefined;
    });

    seedRepository({ repoPath: '/test/repo', worktrees: mockWorktrees });
    const result = await useAppStore.getState().createWorktreeAuto('/test/repo');

    expect(mockInvoke).toHaveBeenCalledWith('create_worktree_auto', {
      repoPath: '/test/repo',
    });
    expect(result).toEqual(newWorktree);
  });

  it('checkGitHubCli invokes check_gh_cli and check_gh_auth', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'check_gh_cli') return true;
      if (cmd === 'check_gh_auth') return 'octocat';
      return undefined;
    });

    await useAppStore.getState().checkGitHubCli();

    const calls = mockInvoke.mock.calls.map((c) => c[0]);
    expect(calls).toContain('check_gh_cli');
    expect(calls).toContain('check_gh_auth');

    const state = useAppStore.getState();
    expect(state.githubSettings.ghCliAvailable).toBe(true);
    expect(state.githubSettings.ghAuthUser).toBe('octocat');
  });

  it('checkGitHubCli handles missing gh cli', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'check_gh_cli') return false;
      return undefined;
    });

    await useAppStore.getState().checkGitHubCli();

    const state = useAppStore.getState();
    expect(state.githubSettings.ghCliAvailable).toBe(false);
    expect(state.githubSettings.ghAuthUser).toBeNull();
  });

  it('refreshProcessStatuses invokes get_all_worktrees_process_status with all worktree paths', async () => {
    mockInvoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'get_all_worktrees_process_status') {
        expect(args).toEqual({
          worktreePaths: ['/test/repo/main', '/test/repo/feat'],
        });

        return {
          '/test/repo/main': 'dev_server',
          '/test/repo/feat': 'agent_running',
        };
      }
      return undefined;
    });

    seedRepository({ repoPath: '/test/repo', worktrees: mockWorktrees });

    await useAppStore.getState().refreshProcessStatuses();

    expect(mockInvoke).toHaveBeenCalledWith('get_all_worktrees_process_status', {
      worktreePaths: ['/test/repo/main', '/test/repo/feat'],
    });
    expect(useAppStore.getState().processStatusByPath).toEqual({
      '/test/repo/main': 'dev_server',
      '/test/repo/feat': 'agent_running',
    });
  });
});
