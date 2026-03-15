import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { CommentsTab } from '../../RightPanel/CommentsTab';
import { resetStore } from '../../../test/helpers/store-helpers';
import type { PRDetailedInfo, PRComment } from '../../../types/github';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

const prComments: PRComment[] = [
  {
    author: 'reviewer-one',
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
  {
    author: 'reviewer-three',
    body: 'This resolved thread has extra context so the collapsed row only shows a preview.',
    created_at: '2026-03-01T13:10:00Z',
    comment_type: 'review_thread',
    review_id: 'review-2',
    path: 'src/components/Button.tsx',
    line: 21,
    is_resolved: true,
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

  it('loads and renders review and thread comments', async () => {
    render(<CommentsTab repoPath="/repo" prNumber={42} prStatus={null} />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get_pr_details', {
        repoPath: '/repo',
        prNumber: 42,
      });
    });

    expect(screen.getByText('Looks good overall.')).toBeTruthy();
    expect(screen.getByText('Nit: simplify this branch.')).toBeTruthy();
    expect(screen.getByText('src/App.tsx')).toBeTruthy();
    expect(screen.getByText('Line 12')).toBeTruthy();
    expect(screen.getByRole('button', { name: /copy all comments/i })).toBeTruthy();
  });

  it('expands resolved thread comments when clicked', async () => {
    render(<CommentsTab repoPath="/repo" prNumber={42} prStatus={null} />);

    const collapsedRow = await screen.findByText('Resolved comment by reviewer-three');
    expect(screen.queryByText('This resolved thread has extra context so the collapsed row only shows a preview.')).toBeNull();

    fireEvent.click(collapsedRow);

    expect(await screen.findByText('This resolved thread has extra context so the collapsed row only shows a preview.')).toBeTruthy();
    expect(screen.getByText('Line 21')).toBeTruthy();
  });

  it('renders a no-comments state when the PR has no comments', async () => {
    mockInvoke.mockResolvedValue({
      ...prDetails,
      comments: [],
    });

    render(<CommentsTab repoPath="/repo" prNumber={42} prStatus={null} />);

    expect(await screen.findByText('No review comments')).toBeTruthy();
  });
});
