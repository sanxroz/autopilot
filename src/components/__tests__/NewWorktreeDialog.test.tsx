import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { NewWorktreeDialog } from '../NewWorktreeDialog';
import { useAppStore } from '../../store';
import { resetStore } from '../../test/helpers/store-helpers';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe('NewWorktreeDialog', () => {
  const onClose = vi.fn();
  const repoPath = '/test/repo';

  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    // Default: return some branches
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'list_branches') {
        return [
          { name: 'feature/auth', is_remote: false, is_head: false },
          { name: 'fix/bug', is_remote: false, is_head: false },
          { name: 'main', is_remote: false, is_head: true },
        ];
      }
      return undefined;
    });
  });

  it('renders form with branch select and name input', async () => {
    render(<NewWorktreeDialog repoPath={repoPath} onClose={onClose} />);

    expect(screen.getByText('New Workspace')).toBeDefined();
    expect(screen.getByText('Branch')).toBeDefined();
    expect(screen.getByText('Workspace name')).toBeDefined();
    expect(screen.getByText('Cancel')).toBeDefined();
    expect(screen.getByText('Create')).toBeDefined();
  });

  it('fetches branches on mount', async () => {
    render(<NewWorktreeDialog repoPath={repoPath} onClose={onClose} />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('list_branches', { repoPath });
    });
  });

  it('auto-fills worktree name from selected branch', async () => {
    render(<NewWorktreeDialog repoPath={repoPath} onClose={onClose} />);

    // Wait for branches to load
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('list_branches', { repoPath });
    });

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'feature/auth' } });

    const input = screen.getByPlaceholderText('e.g., feature-branch') as HTMLInputElement;
    expect(input.value).toBe('feature-auth');
  });

  it('create button disabled when no branch/name selected', () => {
    render(<NewWorktreeDialog repoPath={repoPath} onClose={onClose} />);
    const createBtn = screen.getByText('Create').closest('button')!;
    expect(createBtn.disabled).toBe(true);
  });

  it('calls onClose when Cancel clicked', () => {
    render(<NewWorktreeDialog repoPath={repoPath} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop clicked', () => {
    const { container } = render(
      <NewWorktreeDialog repoPath={repoPath} onClose={onClose} />
    );
    // Click the backdrop (outermost fixed div)
    const backdrop = container.firstElementChild!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows error message on creation failure', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'list_branches') {
        return [{ name: 'feature/auth', is_remote: false, is_head: false }];
      }
      if (cmd === 'create_worktree') {
        throw new Error('Worktree already exists');
      }
      return undefined;
    });

    render(<NewWorktreeDialog repoPath={repoPath} onClose={onClose} />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('list_branches', { repoPath });
    });

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'feature/auth' } });

    const createBtn = screen.getByText('Create').closest('button')!;
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(screen.getByText(/Worktree already exists/)).toBeDefined();
    });
  });
});
