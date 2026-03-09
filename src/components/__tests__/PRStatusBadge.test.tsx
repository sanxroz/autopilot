import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PRStatusBadge } from '../PRStatusBadge';
import type { PRStatus } from '../../types/github';

function createPRStatus(overrides: Partial<PRStatus> = {}): PRStatus {
  return {
    number: 42,
    title: 'Test PR',
    url: 'https://github.com/test/repo/pull/42',
    state: 'open',
    merged: false,
    draft: false,
    review_decision: null,
    checks_status: null,
    additions: 10,
    deletions: 5,
    head_branch: 'test-branch',
    ...overrides,
  };
}

describe('PRStatusBadge', () => {
  it('renders merged state', () => {
    render(<PRStatusBadge prStatus={createPRStatus({ merged: true })} />);
    expect(screen.getByText('Merged')).toBeDefined();
    expect(screen.getByText('#42')).toBeDefined();
  });

  it('renders closed state', () => {
    render(<PRStatusBadge prStatus={createPRStatus({ state: 'closed' })} />);
    expect(screen.getByText('#42')).toBeDefined();
  });

  it('renders draft state', () => {
    render(<PRStatusBadge prStatus={createPRStatus({ draft: true })} />);
    expect(screen.getByText('Draft')).toBeDefined();
  });

  it('renders failing checks state', () => {
    render(<PRStatusBadge prStatus={createPRStatus({ checks_status: 'failure' })} />);
    expect(screen.getByText('Failing')).toBeDefined();
  });

  it('renders pending checks state', () => {
    render(<PRStatusBadge prStatus={createPRStatus({ checks_status: 'pending' })} />);
    expect(screen.getByText('Running')).toBeDefined();
  });

  it('renders approved state', () => {
    render(<PRStatusBadge prStatus={createPRStatus({ review_decision: 'APPROVED' })} />);
    expect(screen.getByText('Approved')).toBeDefined();
  });

  it('renders changes requested state', () => {
    render(<PRStatusBadge prStatus={createPRStatus({ review_decision: 'CHANGES_REQUESTED' })} />);
    expect(screen.getByText('Changes')).toBeDefined();
  });

  it('renders default review state', () => {
    render(<PRStatusBadge prStatus={createPRStatus({ review_decision: 'REVIEW_REQUIRED' })} />);
    expect(screen.getByText('Review')).toBeDefined();
  });

  it('renders compact mode with PR number', () => {
    const { container } = render(
      <PRStatusBadge prStatus={createPRStatus()} compact />
    );
    expect(screen.getByText('#42')).toBeDefined();
    // Compact mode uses div, not a link
    expect(container.querySelector('a')).toBeNull();
  });

  it('renders full mode as link with href', () => {
    const { container } = render(
      <PRStatusBadge prStatus={createPRStatus()} />
    );
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.href).toBe('https://github.com/test/repo/pull/42');
    expect(link?.target).toBe('_blank');
  });
});
