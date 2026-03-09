import React, { forwardRef, useImperativeHandle } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { open } from '@tauri-apps/plugin-dialog';
import { TerminalGrid } from '../TerminalGrid';
import { useAppStore } from '../../store';
import { resetStore, seedSelectedWorktree, setStoreState } from '../../test/helpers/store-helpers';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

vi.mock('../Terminal', () => ({
  Terminal: forwardRef(function MockTerminal(
    {
      terminalId,
      onFocus,
    }: {
      terminalId: string;
      isActive: boolean;
      isVisible: boolean;
      onFocus: () => void;
    },
    ref,
  ) {
    useImperativeHandle(ref, () => ({
      findNext: vi.fn(() => false),
      findPrevious: vi.fn(() => false),
      clearSearch: vi.fn(),
      onDidChangeResults: vi.fn(() => ({ dispose: vi.fn() })),
      focus: vi.fn(),
    }));

    return (
      <button type="button" onClick={onFocus} data-testid={`terminal-${terminalId}`}>
        Terminal {terminalId}
      </button>
    );
  }),
}));

vi.mock('../TerminalSearchBar', () => ({
  TerminalSearchBar: () => <div data-testid="terminal-search-bar">Search</div>,
}));

vi.mock('../TerminalAnimation', () => ({
  TerminalAnimation: () => <div data-testid="terminal-animation" />,
}));

const mockOpen = vi.mocked(open);

const originalActions = {
  addRepository: useAppStore.getState().addRepository,
  addTerminal: useAppStore.getState().addTerminal,
  removeTerminal: useAppStore.getState().removeTerminal,
  setActiveTerminal: useAppStore.getState().setActiveTerminal,
};

describe('TerminalGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    useAppStore.setState(originalActions as Partial<ReturnType<typeof useAppStore.getState>>);
  });

  it('renders the onboarding empty state when nothing is selected', () => {
    render(<TerminalGrid />);

    expect(screen.getByText('Select a workspace from the sidebar to start')).toBeTruthy();
    expect(screen.getByRole('button', { name: /add repository/i })).toBeTruthy();
  });

  it('adds a repository from the empty state action', async () => {
    const addRepository = vi.fn().mockResolvedValue(undefined);
    mockOpen.mockResolvedValue('/repos/new-repo');

    setStoreState({
      addRepository: addRepository as ReturnType<typeof useAppStore.getState>['addRepository'],
    });

    render(<TerminalGrid />);

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

  it('renders current worktree terminals and focuses a terminal on click', () => {
    const setActiveTerminal = vi.fn();
    seedSelectedWorktree({
      worktreePath: '/repos/sample/feature',
      worktreeName: 'feature',
      branch: 'feature',
      terminalId: 'term-1',
    });
    setStoreState({
      currentTerminals: [
        { id: 'term-1', worktreePath: '/repos/sample/feature', worktreeName: 'feature' },
        { id: 'term-2', worktreePath: '/repos/sample/feature', worktreeName: 'feature' },
      ],
      terminalsByWorktree: {
        '/repos/sample/feature': {
          terminals: [
            { id: 'term-1', worktreePath: '/repos/sample/feature', worktreeName: 'feature' },
            { id: 'term-2', worktreePath: '/repos/sample/feature', worktreeName: 'feature' },
          ],
          activeTerminalId: 'term-1',
        },
      },
      currentActiveTerminalId: 'term-1',
      setActiveTerminal: setActiveTerminal as ReturnType<typeof useAppStore.getState>['setActiveTerminal'],
    });

    render(<TerminalGrid />);

    fireEvent.click(screen.getByTestId('terminal-term-2'));

    expect(screen.getByTestId('terminal-term-1')).toBeTruthy();
    expect(screen.getByTestId('terminal-term-2')).toBeTruthy();
    expect(setActiveTerminal).toHaveBeenCalledWith('term-2');
  });

  it('supports keyboard shortcuts for adding, closing, and searching terminals', () => {
    const addTerminal = vi.fn().mockResolvedValue('term-2');
    const removeTerminal = vi.fn();

    seedSelectedWorktree({
      worktreePath: '/repos/sample/feature',
      worktreeName: 'feature',
      branch: 'feature',
      terminalId: 'term-1',
    });
    setStoreState({
      addTerminal: addTerminal as ReturnType<typeof useAppStore.getState>['addTerminal'],
      removeTerminal: removeTerminal as ReturnType<typeof useAppStore.getState>['removeTerminal'],
    });

    render(<TerminalGrid />);

    fireEvent.keyDown(window, { key: 'd', metaKey: true });
    expect(addTerminal).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'w', metaKey: true });
    expect(removeTerminal).toHaveBeenCalledWith('term-1');

    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    expect(screen.getByTestId('terminal-search-bar')).toBeTruthy();
  });
});
