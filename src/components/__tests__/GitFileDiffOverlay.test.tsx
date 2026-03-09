import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { codeToTokens } from 'shiki';
import { GitFileDiffOverlay } from '../GitFileDiffOverlay';
import { useAppStore } from '../../store';
import { resetStore, setStoreState } from '../../test/helpers/store-helpers';
import type { FileDiffData } from '../../types';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('shiki', () => ({
  codeToTokens: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);
const mockCodeToTokens = vi.mocked(codeToTokens);

const originalActions = {
  setGitFileDiffPreview: useAppStore.getState().setGitFileDiffPreview,
  setCodeReviewOpen: useAppStore.getState().setCodeReviewOpen,
};

const diffData: FileDiffData = {
  path: 'src/App.tsx',
  patch: '@@ -1 +1,2 @@\n-export const App = () => null;\n+export const App = () => null;\n+console.log("hi")',
  old_content: 'export const App = () => null;',
  new_content: 'export const App = () => null;\nconsole.log("hi")',
};

describe('GitFileDiffOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    useAppStore.setState(originalActions as Partial<ReturnType<typeof useAppStore.getState>>);
    mockInvoke.mockResolvedValue(diffData);
    mockCodeToTokens.mockResolvedValue({ tokens: [[], []] } as Awaited<ReturnType<typeof codeToTokens>>);
  });

  it('renders nothing when there is no selected file preview', () => {
    const { container } = render(<GitFileDiffOverlay />);

    expect(container.firstChild).toBeNull();
  });

  it('loads and renders the selected file diff', async () => {
    setStoreState({
      gitFileDiffPreview: {
        filePath: 'src/App.tsx',
        worktreePath: '/repo/worktree',
        isStaged: true,
      },
    });

    render(<GitFileDiffOverlay />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get_uncommitted_diff', {
        worktreePath: '/repo/worktree',
        filePath: 'src/App.tsx',
        isStaged: true,
      });
    });

    expect(screen.getByText('App.tsx')).toBeTruthy();
    expect(screen.getByText('staged')).toBeTruthy();
    expect(screen.getByText('+2')).toBeTruthy();
    expect(screen.getByText('-1')).toBeTruthy();
    expect(screen.getByText('console.log("hi")')).toBeTruthy();
  });

  it('clears the preview when closed', async () => {
    const setGitFileDiffPreview = vi.fn();
    setStoreState({
      gitFileDiffPreview: {
        filePath: 'src/App.tsx',
        worktreePath: '/repo/worktree',
        isStaged: false,
      },
      setGitFileDiffPreview: setGitFileDiffPreview as ReturnType<typeof useAppStore.getState>['setGitFileDiffPreview'],
    });

    render(<GitFileDiffOverlay />);

    await screen.findByText('App.tsx');
    fireEvent.click(screen.getByRole('button', { name: /close diff preview/i }));

    expect(setGitFileDiffPreview).toHaveBeenCalledWith(null);
  });

  it('toggles the checks and review panel', async () => {
    const setCodeReviewOpen = vi.fn();
    setStoreState({
      gitFileDiffPreview: {
        filePath: 'README.md',
        worktreePath: '/repo/worktree',
        isStaged: false,
      },
      codeReviewOpen: false,
      setCodeReviewOpen: setCodeReviewOpen as ReturnType<typeof useAppStore.getState>['setCodeReviewOpen'],
    });
    mockInvoke.mockResolvedValue({
      ...diffData,
      path: 'README.md',
      new_content: '# Hello',
    });

    render(<GitFileDiffOverlay />);

    await screen.findByText('README.md');
    fireEvent.click(screen.getByRole('button', { name: /open checks and review panel/i }));

    expect(setCodeReviewOpen).toHaveBeenCalledWith(true);
    expect(screen.getByRole('button', { name: /show diff/i })).toBeTruthy();
  });
});
