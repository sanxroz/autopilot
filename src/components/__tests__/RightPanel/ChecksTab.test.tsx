import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { ChecksTab } from '../../RightPanel/ChecksTab';
import { resetStore } from '../../../test/helpers/store-helpers';
import type { PRChecksResult, PRDetailedInfo } from '../../../types/github';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockInvoke = vi.mocked(invoke);
const toastSuccess = vi.mocked(toast.success);

const checksResult: PRChecksResult = {
  overall_status: 'success',
  checks: [
    {
      name: 'Vercel Preview',
      status: 'completed',
      conclusion: 'success',
      url: 'https://vercel.example.com',
      started_at: '2026-03-01T12:00:00Z',
      completed_at: '2026-03-01T12:01:00Z',
    },
    {
      name: 'CI',
      status: 'completed',
      conclusion: 'success',
      url: 'https://ci.example.com',
      started_at: '2026-03-01T12:00:00Z',
      completed_at: '2026-03-01T12:02:00Z',
    },
  ],
};

const prDetails: PRDetailedInfo = {
  merge_state_status: 'CLEAN',
  mergeable: 'MERGEABLE',
  review_decision: 'APPROVED',
  comments: [],
};

describe('ChecksTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it('renders an empty state when there is no PR number', () => {
    render(<ChecksTab repoPath="/repo" prNumber={null} prStatus={null} />);

    expect(screen.getByText('No PR found for this branch')).toBeTruthy();
  });

  it('loads and renders merge status, deployments, and checks', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_pr_checks') return checksResult;
      if (cmd === 'get_pr_details') return prDetails;
      return undefined;
    });

    render(<ChecksTab repoPath="/repo" prNumber={42} prStatus={null} />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get_pr_checks', { repoPath: '/repo', prNumber: 42 });
      expect(mockInvoke).toHaveBeenCalledWith('get_pr_details', { repoPath: '/repo', prNumber: 42 });
    });

    expect(screen.getByText('Git status')).toBeTruthy();
    expect(screen.getByText('Ready to merge')).toBeTruthy();
    expect(screen.getByText('Deployments')).toBeTruthy();
    expect(screen.getByText('Vercel Preview')).toBeTruthy();
    expect(screen.getByText('Checks')).toBeTruthy();
    expect(screen.getByText('CI')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^merge$/i })).toBeTruthy();
  });

  it('merges a clean PR', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_pr_checks') return checksResult;
      if (cmd === 'get_pr_details') return prDetails;
      if (cmd === 'merge_pr') return { success: true, message: 'merged' };
      return undefined;
    });

    render(<ChecksTab repoPath="/repo" prNumber={42} prStatus={null} />);

    fireEvent.click(await screen.findByRole('button', { name: /^merge$/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('merge_pr', {
        repoPath: '/repo',
        prNumber: 42,
      });
      expect(toastSuccess).toHaveBeenCalledWith('PR #42 merged');
    });
  });

  it('renders a no-checks fallback when the PR has no checks', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_pr_checks') return { overall_status: 'none', checks: [] };
      if (cmd === 'get_pr_details') return prDetails;
      return undefined;
    });

    render(<ChecksTab repoPath="/repo" prNumber={42} prStatus={null} />);

    expect(await screen.findByText('No checks')).toBeTruthy();
  });
});
