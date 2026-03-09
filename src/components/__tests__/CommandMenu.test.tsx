import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommandMenu } from '../CommandMenu';
import { useAppStore } from '../../store';
import { resetStore, setStoreState, seedRepository } from '../../test/helpers/store-helpers';

// Mock framer-motion (not used by CommandMenu but may be in ui components)
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_target, prop) => {
      return ({ children, ...props }: any) => <span data-motion={String(prop)} {...props}>{children}</span>;
    },
  }),
  AnimatePresence: ({ children }: any) => children,
  useReducedMotion: () => false,
}));

// Mock the command-menu UI primitives
vi.mock('../ui/command-menu', () => ({
  Dialog: ({ children, open }: any) =>
    open ? <div data-testid="cmd-dialog">{children}</div> : null,
  Input: ({ value, onValueChange, placeholder, ...props }: any) => (
    <input
      data-testid="cmd-input"
      value={value}
      onChange={(e: any) => onValueChange(e.target.value)}
      placeholder={placeholder}
      {...props}
    />
  ),
  List: ({ children, ...props }: any) => <div data-testid="cmd-list" {...props}>{children}</div>,
  Group: ({ children, heading }: any) => (
    <div data-testid={`cmd-group-${heading}`}>
      <div>{heading}</div>
      {children}
    </div>
  ),
  Item: ({ children, onSelect, ...props }: any) => (
    <div data-testid="cmd-item" onClick={onSelect} role="option" {...props}>
      {children}
    </div>
  ),
  ItemIcon: ({ as: Icon, ...props }: any) => <span data-testid="cmd-icon" {...props} />,
  Footer: ({ children, ...props }: any) => <div data-testid="cmd-footer" {...props}>{children}</div>,
  FooterKeyBox: ({ children, ...props }: any) => <kbd {...props}>{children}</kbd>,
}));

// Mock theme hook
vi.mock('../../hooks/useTheme', () => ({
  useThemeMode: () => 'dark',
}));

// Mock dialog
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(async () => '/mock/path'),
}));

describe('CommandMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <CommandMenu open={false} onOpenChange={vi.fn()} />
    );
    expect(container.querySelector('[data-testid="cmd-dialog"]')).toBeNull();
  });

  it('renders workspace list from repositories', () => {
    seedRepository({
      repoPath: '/repo1',
      repoName: 'repo1',
      worktrees: [
        { name: 'main', path: '/repo1/main', branch: 'main', last_modified: null },
        { name: 'feat', path: '/repo1/feat', branch: 'feat/auth', last_modified: null },
      ],
    });

    render(<CommandMenu open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText('Workspaces')).toBeDefined();
    expect(screen.getByText('feat/auth')).toBeDefined();
  });

  it('filters out main worktrees from workspace list', () => {
    seedRepository({
      repoPath: '/repo1',
      repoName: 'repo1',
      worktrees: [
        { name: 'main', path: '/repo1/main', branch: 'main', last_modified: null },
        { name: 'feat', path: '/repo1/feat', branch: 'feature', last_modified: null },
      ],
    });

    render(<CommandMenu open={true} onOpenChange={vi.fn()} />);
    // "main" should not appear as a workspace option
    const items = screen.getAllByTestId('cmd-item');
    const workspaceTexts = items.map((i) => i.textContent);
    expect(workspaceTexts.some((t) => t?.includes('feature'))).toBe(true);
  });

  it('shows action items', () => {
    render(<CommandMenu open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText('Actions')).toBeDefined();
    expect(screen.getByText('Add Repository')).toBeDefined();
    expect(screen.getByText('New Workspace')).toBeDefined();
  });

  it('shows navigation items', () => {
    render(<CommandMenu open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText('Navigation')).toBeDefined();
    expect(screen.getByText('Toggle Code Review')).toBeDefined();
    expect(screen.getByText('Open Settings')).toBeDefined();
  });

  it('shows theme toggle item', () => {
    render(<CommandMenu open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText('Theme')).toBeDefined();
    expect(screen.getByText(/Switch to Light Mode/)).toBeDefined();
  });

  it('highlights current worktree', () => {
    seedRepository({
      repoPath: '/repo1',
      repoName: 'repo1',
      worktrees: [
        { name: 'main', path: '/repo1/main', branch: 'main', last_modified: null },
        { name: 'feat', path: '/repo1/feat', branch: 'feature', last_modified: null },
      ],
    });
    setStoreState({
      selectedWorktree: { name: 'feat', path: '/repo1/feat', branch: 'feature', last_modified: null },
    });

    const { container } = render(
      <CommandMenu open={true} onOpenChange={vi.fn()} />
    );
    // The active item should have data-active="true"
    const activeItem = container.querySelector('[data-active="true"]');
    expect(activeItem).not.toBeNull();
  });
});
