import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Navbar } from '../Navbar';
import { useAppStore } from '../../store';
import { resetStore, setStoreState } from '../../test/helpers/store-helpers';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_target, prop) => {
      // Return a forwardRef component for motion elements
      const Component = ({ children, ...props }: any) => {
        const tag = String(prop);
        const filteredProps = Object.fromEntries(
          Object.entries(props).filter(([key]) =>
            !['whileHover', 'whileTap', 'transition', 'initial', 'animate', 'exit'].includes(key)
          )
        );
        // Using createElement to avoid JSX issues with dynamic tags
        const el = document.createElement(tag);
        return <span data-motion={tag} {...filteredProps}>{children}</span>;
      };
      return Component;
    },
  }),
  AnimatePresence: ({ children }: any) => children,
  useReducedMotion: () => false,
}));

describe('Navbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it('renders branch name from selected worktree', () => {
    setStoreState({
      selectedWorktree: {
        name: 'my-worktree',
        path: '/repo/wt',
        branch: 'feature/test',
        last_modified: null,
      },
    });

    render(<Navbar sidebarOpen={true} onToggleSidebar={vi.fn()} />);
    expect(screen.getByText('feature/test')).toBeDefined();
  });

  it('renders worktree name when different from branch', () => {
    setStoreState({
      selectedWorktree: {
        name: 'my-worktree',
        path: '/repo/wt',
        branch: 'feature/test',
        last_modified: null,
      },
    });

    render(<Navbar sidebarOpen={true} onToggleSidebar={vi.fn()} />);
    expect(screen.getByText('feature/test')).toBeDefined();
    expect(screen.getByText('my-worktree')).toBeDefined();
  });

  it('shows nothing when no worktree selected', () => {
    setStoreState({ selectedWorktree: null });

    const { container } = render(<Navbar sidebarOpen={true} onToggleSidebar={vi.fn()} />);
    // Should not have branch text
    expect(container.textContent).not.toContain('feature');
  });

  it('toggle sidebar button calls onToggleSidebar', () => {
    const onToggleSidebar = vi.fn();
    render(<Navbar sidebarOpen={true} onToggleSidebar={onToggleSidebar} />);

    const btn = screen.getByLabelText('Hide sidebar');
    fireEvent.click(btn);
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('shows correct sidebar toggle label based on sidebarOpen', () => {
    const { rerender } = render(
      <Navbar sidebarOpen={true} onToggleSidebar={vi.fn()} />
    );
    expect(screen.getByLabelText('Hide sidebar')).toBeDefined();

    rerender(<Navbar sidebarOpen={false} onToggleSidebar={vi.fn()} />);
    expect(screen.getByLabelText('Show sidebar')).toBeDefined();
  });

  it('right panel button toggles code review', () => {
    setStoreState({ codeReviewOpen: false });

    render(<Navbar sidebarOpen={true} onToggleSidebar={vi.fn()} />);
    const btn = screen.getByLabelText('Open checks and review panel');
    fireEvent.click(btn);

    expect(useAppStore.getState().codeReviewOpen).toBe(true);
  });

  it('diff overlay button toggles diff when in overlay mode', () => {
    setStoreState({ diffViewMode: 'overlay', diffOverlayOpen: false });

    render(<Navbar sidebarOpen={true} onToggleSidebar={vi.fn()} />);
    const btn = screen.getByLabelText('Toggle diff overlay');
    fireEvent.click(btn);

    expect(useAppStore.getState().diffOverlayOpen).toBe(true);
  });
});
