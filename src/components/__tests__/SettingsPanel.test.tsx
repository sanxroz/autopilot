import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPanel } from '../SettingsPanel';
import { useAppStore } from '../../store';
import { resetStore, setStoreState } from '../../test/helpers/store-helpers';

describe('SettingsPanel', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it('renders navigation with all sections', () => {
    render(<SettingsPanel onClose={onClose} />);
    // Some labels appear both in nav and content header, use getAllByText
    expect(screen.getAllByText('Account').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Appearance').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Preferences').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Skills').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Custom Agents').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('MCP Servers').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Debug').length).toBeGreaterThanOrEqual(1);
  });

  it('shows Account section by default', () => {
    render(<SettingsPanel onClose={onClose} />);
    expect(screen.getByText('GitHub Account')).toBeDefined();
  });

  it('switches sections on nav click', () => {
    render(<SettingsPanel onClose={onClose} />);

    fireEvent.click(screen.getByText('Debug'));
    expect(screen.getByText('GitHub Integration')).toBeDefined();

    fireEvent.click(screen.getByText('Preferences'));
    expect(screen.getByText('AI Integration')).toBeDefined();
  });

  it('shows GitHub user info when authenticated', () => {
    setStoreState({
      githubSettings: {
        ghCliAvailable: true,
        ghAuthUser: 'octocat',
        pollingIntervalMs: 30000,
      },
    });

    render(<SettingsPanel onClose={onClose} />);
    // Username appears multiple times (avatar alt text, display name, etc.)
    expect(screen.getAllByText('octocat').length).toBeGreaterThanOrEqual(1);
  });

  it('shows GitHub CLI not installed message when not available', () => {
    setStoreState({
      githubSettings: {
        ghCliAvailable: false,
        ghAuthUser: null,
        pollingIntervalMs: 30000,
      },
    });

    render(<SettingsPanel onClose={onClose} />);
    expect(screen.getByText(/Not installed/)).toBeDefined();
  });

  it('close button calls onClose', () => {
    render(<SettingsPanel onClose={onClose} />);
    const closeBtn = screen.getByLabelText('Close settings');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop click calls onClose', () => {
    const { container } = render(<SettingsPanel onClose={onClose} />);
    // Click the backdrop (outermost fixed div)
    const backdrop = container.firstElementChild!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Save button calls onClose', () => {
    render(<SettingsPanel onClose={onClose} />);
    fireEvent.click(screen.getByText('Save'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('preferences section shows AI agent selector', () => {
    render(<SettingsPanel onClose={onClose} />);
    fireEvent.click(screen.getByText('Preferences'));
    expect(screen.getByText('Default AI Agent')).toBeDefined();
  });
});
