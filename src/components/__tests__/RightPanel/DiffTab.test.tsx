import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DiffTab } from '../../RightPanel/DiffTab';
import { useAppStore } from '../../../store';
import { resetStore, setStoreState } from '../../../test/helpers/store-helpers';
import type { ChangedFile, FileDiffData } from '../../../types';

const { useCodeReviewMock } = vi.hoisted(() => ({
  useCodeReviewMock: vi.fn(),
}));

vi.mock('../../../hooks/useCodeReview', () => ({
  useCodeReview: (...args: unknown[]) => useCodeReviewMock(...args),
}));

vi.mock('../../../lib/diff-highlighter', () => ({
  getDiffHighlighter: vi.fn(async () => null),
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 36,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 36,
      })),
    measureElement: vi.fn(),
  }),
}));

vi.mock('@git-diff-view/react', () => ({
  DiffView: () => <div data-testid="diff-view">Rendered diff</div>,
  DiffModeEnum: { Unified: 'Unified' },
  DiffFile: {
    createInstance: () => ({
      initTheme: vi.fn(),
      init: vi.fn(),
      buildUnifiedDiffLines: vi.fn(),
      clear: vi.fn(),
    }),
  },
}));

const changedFiles: ChangedFile[] = [
  {
    path: 'src/App.tsx',
    status: 'modified',
    additions: 2,
    deletions: 1,
  },
];

const diffs: Record<string, FileDiffData> = {
  'src/App.tsx': {
    path: 'src/App.tsx',
    patch: '@@ -1 +1 @@\n-old\n+new',
  },
};

const originalActions = {
  setDiffViewMode: useAppStore.getState().setDiffViewMode,
  setDiffOverlayOpen: useAppStore.getState().setDiffOverlayOpen,
};

function mockCodeReviewState(overrides: Record<string, unknown> = {}) {
  useCodeReviewMock.mockReturnValue({
    changedFiles,
    isLoading: false,
    error: null,
    getDiff: (path: string) => diffs[path] ?? null,
    loadDiff: vi.fn().mockResolvedValue(undefined),
    isDiffLoading: vi.fn(() => false),
    refresh: vi.fn(),
    diffMode: 'local',
    setDiffMode: vi.fn(),
    ...overrides,
  });
}

describe('DiffTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    useAppStore.setState(originalActions as Partial<ReturnType<typeof useAppStore.getState>>);
  });

  it('renders the empty state when there are no changes', () => {
    mockCodeReviewState({ changedFiles: [] });

    render(<DiffTab worktreePath="/repo/worktree" />);

    expect(screen.getByText('No changes detected')).toBeTruthy();
  });

  it('renders changed files and the summary header', () => {
    mockCodeReviewState();

    render(<DiffTab worktreePath="/repo/worktree" />);

    expect(screen.getByText('1 files')).toBeTruthy();
    expect(screen.getAllByText('+2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('-1').length).toBeGreaterThan(0);
    expect(screen.getByText('App.tsx')).toBeTruthy();
  });

  it('expands the sidebar diff back to the overlay', () => {
    const setDiffViewMode = vi.fn();
    const setDiffOverlayOpen = vi.fn();
    mockCodeReviewState();
    setStoreState({
      setDiffViewMode: setDiffViewMode as ReturnType<typeof useAppStore.getState>['setDiffViewMode'],
      setDiffOverlayOpen: setDiffOverlayOpen as ReturnType<typeof useAppStore.getState>['setDiffOverlayOpen'],
    });

    render(<DiffTab worktreePath="/repo/worktree" />);

    fireEvent.click(screen.getByRole('button', { name: /expand to overlay/i }));

    expect(setDiffViewMode).toHaveBeenCalledWith('overlay');
    expect(setDiffOverlayOpen).toHaveBeenCalledWith(true);
  });

  it('collapses and expands all file sections', async () => {
    mockCodeReviewState();

    render(<DiffTab worktreePath="/repo/worktree" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /collapse all files/i })).toBeTruthy();
    });

    const fileHeader = screen.getByText('App.tsx').closest('[role="button"]');
    expect(fileHeader?.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /collapse all files/i }));

    await waitFor(() => {
      expect(fileHeader?.getAttribute('aria-expanded')).toBe('false');
    });

    fireEvent.click(screen.getByRole('button', { name: /expand all files/i }));

    await waitFor(() => {
      expect(fileHeader?.getAttribute('aria-expanded')).toBe('true');
    });
  });
});
