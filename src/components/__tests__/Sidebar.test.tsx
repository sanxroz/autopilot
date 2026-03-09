import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { open } from '@tauri-apps/plugin-dialog';
import { Sidebar } from '../Sidebar';
import { useAppStore } from '../../store';
import { resetStore, setStoreState } from '../../test/helpers/store-helpers';
import type { Repository, WorktreeInfo } from '../../types';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

const mockOpen = vi.mocked(open);

const originalActions = {
  addRepository: useAppStore.getState().addRepository,
  removeRepository: useAppStore.getState().removeRepository,
  selectWorktree: useAppStore.getState().selectWorktree,
  createWorktreeAuto: useAppStore.getState().createWorktreeAuto,
  deleteWorktree: useAppStore.getState().deleteWorktree,
  toggleRepoCollapsed: useAppStore.getState().toggleRepoCollapsed,
  setThemeMode: useAppStore.getState().setThemeMode,
  toggleSettings: useAppStore.getState().toggleSettings,
};

const repoPath = '/repos/sample';
const featureWorktree: WorktreeInfo = {
  name: 'feature-one',
  path: `${repoPath}/feature-one`,
  branch: 'feature/one',
  last_modified: '2026-03-01T00:00:00Z',
};

const repository: Repository = {
  info: {
    path: repoPath,
    name: 'sample-repo',
  },
  isExpanded: true,
  worktrees: [
    {
      name: 'main',
      path: `${repoPath}/main`,
      branch: 'main',
      last_modified: '2026-02-01T00:00:00Z',
    },
    featureWorktree,
  ],
};

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    useAppStore.setState(originalActions as Partial<ReturnType<typeof useAppStore.getState>>);
    setStoreState({
      repositories: [],
      collapsedRepos: new Set(),
      githubSettings: {
        ghCliAvailable: true,
        ghAuthUser: 'octocat',
        pollingIntervalMs: 30000,
      },
    });
  });

  it('renders the empty state when no repositories are added', () => {
    render(<Sidebar isOpen />);

    expect(screen.getByText('No repositories added yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: /add repository/i })).toBeTruthy();
  });

  it('adds a repository from the file picker', async () => {
    const addRepository = vi.fn().mockResolvedValue(undefined);
    mockOpen.mockResolvedValue('/repos/new-repo');
    setStoreState({
      addRepository: addRepository as ReturnType<typeof useAppStore.getState>['addRepository'],
    });

    render(<Sidebar isOpen />);

    fireEvent.click(screen.getByRole('button', { name: /add repository/i }));

    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalledWith({
        directory: true,
        multiple: false,
        title: 'Select Repository',
      });
      expect(addRepository).toHaveBeenCalledWith('/repos/new-repo');
    });
  });

  it('renders repository groups and hides the main worktree entry', () => {
    setStoreState({ repositories: [repository] });

    render(<Sidebar isOpen />);

    expect(screen.getByText('sample-repo')).toBeTruthy();
    expect(screen.getByText('feature/one')).toBeTruthy();
    expect(screen.queryByText(/^main$/)).toBeNull();
  });

  it('collapses a repository when its header is clicked', async () => {
    const toggleRepoCollapsed = vi.fn((path: string) => {
      setStoreState({ collapsedRepos: new Set([path]) });
    });

    setStoreState({
      repositories: [repository],
      toggleRepoCollapsed: toggleRepoCollapsed as ReturnType<typeof useAppStore.getState>['toggleRepoCollapsed'],
    });

    render(<Sidebar isOpen />);

    fireEvent.click(screen.getByLabelText(/sample-repo repository/i));

    await waitFor(() => {
      expect(toggleRepoCollapsed).toHaveBeenCalledWith(repoPath);
      expect(screen.queryByText('feature/one')).toBeNull();
    });
  });

  it('selects a worktree when a worktree item is clicked', async () => {
    const selectWorktree = vi.fn().mockResolvedValue(undefined);
    setStoreState({
      repositories: [repository],
      selectWorktree: selectWorktree as ReturnType<typeof useAppStore.getState>['selectWorktree'],
    });

    render(<Sidebar isOpen />);

    fireEvent.click(screen.getByText('feature/one'));

    await waitFor(() => {
      expect(selectWorktree).toHaveBeenCalledWith(featureWorktree);
    });
  });

  it('creates a workspace and selects it', async () => {
    const createWorktreeAuto = vi.fn().mockResolvedValue({
      name: 'new-worktree',
      path: `${repoPath}/new-worktree`,
      branch: 'feature/new-worktree',
      last_modified: null,
    });
    const selectWorktree = vi.fn().mockResolvedValue(undefined);

    setStoreState({
      repositories: [repository],
      createWorktreeAuto: createWorktreeAuto as ReturnType<typeof useAppStore.getState>['createWorktreeAuto'],
      selectWorktree: selectWorktree as ReturnType<typeof useAppStore.getState>['selectWorktree'],
    });

    render(<Sidebar isOpen />);

    fireEvent.click(screen.getByRole('button', { name: /create new workspace/i }));

    await waitFor(() => {
      expect(createWorktreeAuto).toHaveBeenCalledWith(repoPath);
      expect(selectWorktree).toHaveBeenCalledWith({
        name: 'new-worktree',
        path: `${repoPath}/new-worktree`,
        branch: 'feature/new-worktree',
        last_modified: null,
      });
    });
  });
});
