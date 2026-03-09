import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DiffOverlay } from '../DiffOverlay';
import { useAppStore } from '../../store';
import { resetStore, setStoreState } from '../../test/helpers/store-helpers';
import type { ChangedFile, FileDiffData } from '../../types';

const { useCodeReviewMock } = vi.hoisted(() => ({
  useCodeReviewMock: vi.fn(),
}));

vi.mock('../../hooks/useCodeReview', () => ({
  useCodeReview: (...args: unknown[]) => useCodeReviewMock(...args),
}));

vi.mock('../../lib/diff-highlighter', () => ({
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

const originalActions = {
  setDiffViewMode: useAppStore.getState().setDiffViewMode,
  setCodeReviewOpen: useAppStore.getState().setCodeReviewOpen,
};

const changedFiles: ChangedFile[] = [
  {
    path: 'src/App.tsx',
    status: 'modified',
    additions: 2,
    deletions: 1,
  },
  {
    path: 'src/styles.css',
    status: 'added',
    additions: 1,
    deletions: 0,
  },
];

const diffs: Record<string, FileDiffData> = {
  'src/App.tsx': {
    path: 'src/App.tsx',
    patch: '@@ -1 +1 @@\n-old\n+new',
  },
  'src/styles.css': {
    path: 'src/styles.css',
    patch: '@@ -0,0 +1 @@\n+.app {}',
  },
};

function mockCodeReviewState(overrides: Partial<ReturnType<typeof useCodeReviewMock>> = {}) {
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

describe('DiffOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    useAppStore.setState(originalActions as Partial<ReturnType<typeof useAppStore.getState>>);
  });

  it('renders the loading state', () => {
    mockCodeReviewState({ changedFiles: [], isLoading: true });

    render(<DiffOverlay worktreePath="/repo/worktree" onClose={vi.fn()} />);

    expect(screen.getByText('Loading changes...')).toBeTruthy();
  });

  it('renders changed files and summary counts', async () => {
    mockCodeReviewState();

    render(<DiffOverlay worktreePath="/repo/worktree" onClose={vi.fn()} />);

    expect(screen.getByText('2 files')).toBeTruthy();
    expect(screen.getAllByText('+3').length).toBeGreaterThan(0);
    expect(screen.getAllByText('-1').length).toBeGreaterThan(0);
    expect(screen.getByText('App.tsx')).toBeTruthy();
    expect(screen.getByText('styles.css')).toBeTruthy();

    await waitFor(() => {
      const headers = screen.getAllByRole('button', { expanded: true });
      expect(headers.length).toBeGreaterThan(0);
    });
  });

  it('moves the diff view to the sidebar and closes the overlay', () => {
    const onClose = vi.fn();
    const setDiffViewMode = vi.fn();
    const setCodeReviewOpen = vi.fn();
    mockCodeReviewState();
    setStoreState({
      setDiffViewMode: setDiffViewMode as ReturnType<typeof useAppStore.getState>['setDiffViewMode'],
      setCodeReviewOpen: setCodeReviewOpen as ReturnType<typeof useAppStore.getState>['setCodeReviewOpen'],
    });

    render(<DiffOverlay worktreePath="/repo/worktree" onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /move to sidebar/i }));

    expect(setDiffViewMode).toHaveBeenCalledWith('sidebar');
    expect(setCodeReviewOpen).toHaveBeenCalledWith(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('collapses and expands all files', async () => {
    mockCodeReviewState();

    render(<DiffOverlay worktreePath="/repo/worktree" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /collapse all files/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /collapse all files/i }));

    await waitFor(() => {
      expect(screen.getAllByRole('button', { expanded: false }).length).toBeGreaterThanOrEqual(2);
    });

    fireEvent.click(screen.getByRole('button', { name: /expand all files/i }));

    await waitFor(() => {
      expect(screen.getAllByRole('button', { expanded: true }).length).toBeGreaterThanOrEqual(2);
    });
  });
});
