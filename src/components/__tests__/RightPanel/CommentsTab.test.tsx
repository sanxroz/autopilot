import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { CommentsTab } from '../../RightPanel/CommentsTab';
import { useAppStore } from '../../../store';
import { resetStore } from '../../../test/helpers/store-helpers';
import type { PRDetailedInfo, PRComment } from '../../../types/github';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

const prComments: PRComment[] = [
  {
    author: 'reviewer-one',
    body: 'Please rename this variable.',
    created_at: '2026-03-01T12:00:00Z',
    comment_type: 'issue',
  },
  {
    author: 'reviewer-two',
    body: 'Looks good overall.',
    created_at: '2026-03-01T13:00:00Z',
    comment_type: 'review',
    review_id: 'review-1',
    state: 'COMMENTED',
  },
  {
    author: 'reviewer-two',
    body: 'Nit: simplify this branch.',
    created_at: '2026-03-01T13:05:00Z',
    comment_type: 'review_thread',
    review_id: 'review-1',
    path: 'src/App.tsx',
    line: 12,
  },
];

const prDetails: PRDetailedInfo = {
  merge_state_status: 'CLEAN',
  mergeable: 'MERGEABLE',
  review_decision: 'REVIEW_REQUIRED',
  comments: prComments,
};

describe('CommentsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    mockInvoke.mockResolvedValue(prDetails);
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(),
      },
    });
  });

  it('renders an empty state when there is no PR number', () => {
    render(<CommentsTab repoPath="/repo" prNumber={null} prStatus={null} />);

    expect(screen.getByText('No PR found for this branch')).toBeTruthy();
  });

  it('loads and renders comments with progress tracking', async () => {
    render(<CommentsTab repoPath="/repo" prNumber={42} prStatus={null} />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get_pr_details', {
        repoPath: '/repo',
        prNumber: 42,
      });
    });

    expect(screen.getByText('Please rename this variable.')).toBeTruthy();
    expect(screen.getByText('Looks good overall.')).toBeTruthy();
    expect(screen.getByText('1 code comment')).toBeTruthy();
    expect(screen.getByText('0 / 2 addressed')).toBeTruthy();
  });

  it('toggles addressed comments and can hide them', async () => {
    render(<CommentsTab repoPath="/repo" prNumber={42} prStatus={null} />);

    await screen.findByText('Please rename this variable.');

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]!);

    await waitFor(() => {
      expect(screen.getByText('1 / 2 addressed')).toBeTruthy();
      expect(useAppStore.getState().isCommentAddressed('/repo', 42, 'issue:2026-03-01T12:00:00Z:reviewer-one')).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: /show remaining comments/i }));

    expect(screen.queryByText('Please rename this variable.')).toBeNull();
  });

  it('renders a no-comments state when the PR has no comments', async () => {
    mockInvoke.mockResolvedValue({
      ...prDetails,
      comments: [],
    });

    render(<CommentsTab repoPath="/repo" prNumber={42} prStatus={null} />);

    expect(await screen.findByText('No comments yet')).toBeTruthy();
  });
});
