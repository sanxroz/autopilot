import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { GitTab } from '../../RightPanel/GitTab';
import { useAppStore } from '../../../store';
import { resetStore, setStoreState } from '../../../test/helpers/store-helpers';
import type { GitStatus } from '../../../types';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => vi.fn()),
}));

const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);

const originalActions = {
  setGitFileDiffPreview: useAppStore.getState().setGitFileDiffPreview,
};

const statusWithChanges: GitStatus = {
  branch: 'feature/test',
  upstream_branch: 'origin/feature/test',
  ahead: 1,
  behind: 0,
  staged: [
    {
      path: 'src/App.tsx',
      status: 'modified',
      staged: true,
    },
  ],
  unstaged: [
    {
      path: 'README.md',
      status: 'added',
      staged: false,
    },
  ],
};

describe('GitTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    useAppStore.setState(originalActions as Partial<ReturnType<typeof useAppStore.getState>>);
    mockListen.mockResolvedValue(vi.fn());
  });

  it('renders an empty state when no worktree is selected', () => {
    render(<GitTab worktreePath={null} />);

    expect(screen.getByText('No worktree selected')).toBeTruthy();
  });

  it('loads and renders the git status summary', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_git_status') return statusWithChanges;
      if (cmd === 'start_watching_worktree_files') return undefined;
      return undefined;
    });

    render(<GitTab worktreePath="/repo/worktree" />);

    await screen.findByText('2 Changes');

    expect(mockInvoke).toHaveBeenCalledWith('get_git_status', { worktreePath: '/repo/worktree' });
    expect(mockInvoke).toHaveBeenCalledWith('start_watching_worktree_files', { worktreePath: '/repo/worktree' });
    expect(screen.getByText('feature/test')).toBeTruthy();
    expect(screen.getByText('App.tsx')).toBeTruthy();
    expect(screen.getByText('README.md')).toBeTruthy();
    expect(screen.getByRole('button', { name: /generate commit message with ai/i })).toBeTruthy();
  });

  it('selects a file to preview its diff', async () => {
    const setGitFileDiffPreview = vi.fn();
    setStoreState({
      setGitFileDiffPreview: setGitFileDiffPreview as ReturnType<typeof useAppStore.getState>['setGitFileDiffPreview'],
    });
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_git_status') return statusWithChanges;
      if (cmd === 'start_watching_worktree_files') return undefined;
      return undefined;
    });

    render(<GitTab worktreePath="/repo/worktree" />);

    fireEvent.click(await screen.findByText('README.md'));

    expect(setGitFileDiffPreview).toHaveBeenCalledWith({
      filePath: 'README.md',
      worktreePath: '/repo/worktree',
      isStaged: false,
    });
  });

  it('stages all changes', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_git_status') return statusWithChanges;
      if (cmd === 'git_stage_all') return undefined;
      if (cmd === 'start_watching_worktree_files') return undefined;
      return undefined;
    });

    render(<GitTab worktreePath="/repo/worktree" />);

    fireEvent.click(await screen.findByRole('button', { name: /stage all/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git_stage_all', { worktreePath: '/repo/worktree' });
    });
  });

  it('generates a commit message and commits staged changes', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_git_status') return statusWithChanges;
      if (cmd === 'generate_commit_message') return 'feat: update app';
      if (cmd === 'git_commit') return 'abc123';
      if (cmd === 'start_watching_worktree_files') return undefined;
      return undefined;
    });
    setStoreState({ defaultAIAgent: 'claude' });

    render(<GitTab worktreePath="/repo/worktree" />);

    fireEvent.click(await screen.findByRole('button', { name: /generate commit message with ai/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('generate_commit_message', {
        worktreePath: '/repo/worktree',
        agent: 'claude',
      });
    });

    const textarea = screen.getByRole('textbox', { name: /commit message/i }) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toBe('feat: update app');
    });

    fireEvent.click(screen.getByRole('button', { name: /^commit$/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('git_commit', {
        worktreePath: '/repo/worktree',
        message: 'feat: update app',
      });
    });
  });
});
