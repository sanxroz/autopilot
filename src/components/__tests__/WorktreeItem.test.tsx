import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorktreeItem } from '../WorktreeItem';
import type { PRStatus } from '../../types/github';
import type { ProcessStatus, AgentRunState } from '../../types';

type WorktreeItemProps = React.ComponentProps<typeof WorktreeItem>;

const defaultProps: WorktreeItemProps = {
  name: 'my-worktree',
  branch: 'feature/test' as string | null,
  lastModified: '2025-01-15T10:00:00Z',
  diffStats: undefined,
  prStatus: null as PRStatus | null,
  processStatus: 'none' as ProcessStatus,
  agentRunState: undefined as AgentRunState | undefined,
  isActive: false,
  onSelect: vi.fn(),
  onDelete: vi.fn(),
};

function renderItem(overrides: Partial<typeof defaultProps> = {}) {
  return render(<WorktreeItem {...defaultProps} {...overrides} />);
}

describe('WorktreeItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders branch name', () => {
    renderItem({ branch: 'feature/test' });
    expect(screen.getByText('feature/test')).toBeDefined();
  });

  it('renders worktree name when no branch', () => {
    renderItem({ branch: null });
    // The name appears in both the main display and the secondary line
    expect(screen.getAllByText('my-worktree').length).toBeGreaterThanOrEqual(1);
  });

  it('shows diff stats', () => {
    renderItem({ diffStats: { additions: 42, deletions: 7 } });
    expect(screen.getByText('+42')).toBeDefined();
    expect(screen.getByText('-7')).toBeDefined();
  });

  it('shows PR status info', () => {
    const prStatus: PRStatus = {
      number: 99,
      title: 'Test PR',
      url: 'https://github.com/test/repo/pull/99',
      state: 'open',
      merged: false,
      draft: false,
      review_decision: 'APPROVED',
      checks_status: 'success',
      additions: 10,
      deletions: 5,
      head_branch: 'feature/test',
    };
    renderItem({ prStatus });
    expect(screen.getByText('PR #99')).toBeDefined();
    expect(screen.getByText('Ready to merge')).toBeDefined();
  });

  it('shows process status indicator for dev_server', () => {
    const { container } = renderItem({ processStatus: 'dev_server' });
    const dot = container.querySelector('.bg-semantic-success');
    expect(dot).not.toBeNull();
  });

  it('shows agent running status', () => {
    const agentRunState: AgentRunState = {
      worktreePath: '/repo/wt',
      sessionId: 'sess-1',
      status: 'running',
      startedAt: Date.now(),
      lastEventAt: Date.now(),
      label: 'Claude running',
    };
    renderItem({ agentRunState });
    // The spinner icon should be present (Loader with animate-spin)
    const { container } = renderItem({ agentRunState });
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('shows agent completed status', () => {
    const agentRunState: AgentRunState = {
      worktreePath: '/repo/wt',
      sessionId: 'sess-1',
      status: 'completed',
      startedAt: Date.now() - 1000,
      lastEventAt: Date.now(),
      endedAt: Date.now(), // just ended, within 5s window
    };
    const { container } = renderItem({ agentRunState });
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('applies active styling class', () => {
    const { container } = renderItem({ isActive: true });
    const button = container.querySelector('[role="button"]');
    expect(button?.className).toContain('bg-active');
  });

  it('applies non-active styling class', () => {
    const { container } = renderItem({ isActive: false });
    const button = container.querySelector('[role="button"]');
    expect(button?.className).not.toContain('bg-active');
  });

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn();
    const { container } = renderItem({ onSelect });
    const button = container.querySelector('[role="button"]')!;
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onDelete when delete button clicked', () => {
    const onDelete = vi.fn();
    const { container } = renderItem({ onDelete });
    const deleteBtn = container.querySelector('[aria-label="Delete worktree"]')!;
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('displays worktree name in secondary line', () => {
    renderItem({ branch: 'feature/test', name: 'my-worktree' });
    expect(screen.getByText('my-worktree')).toBeDefined();
  });
});
