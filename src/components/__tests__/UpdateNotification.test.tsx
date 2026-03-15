import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UpdateNotification } from '../UpdateNotification';

// Mock the modal UI component
vi.mock('../ui/modal', () => ({
  Root: ({ children, open }: any) => open ? <div data-testid="modal-root">{children}</div> : null,
  Content: ({ children, showClose, ...props }: any) => <div data-testid="modal-content" {...props}>{children}</div>,
  Title: ({ children, ...props }: any) => <h2 {...props}>{children}</h2>,
  Description: ({ children, ...props }: any) => <p {...props}>{children}</p>,
}));

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  updateInfo: { version: '2.0.0', body: 'Bug fixes', date: 'March 1, 2025' },
  downloadProgress: 0,
  status: 'available' as const,
  error: undefined,
  onUpdate: vi.fn(),
  onLater: vi.fn(),
  onRestart: vi.fn(),
  onRetry: vi.fn(),
};

describe('UpdateNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when status is idle', () => {
    const { container } = render(
      <UpdateNotification {...defaultProps} status="idle" />
    );
    expect(container.innerHTML).toBe('');
  });

  it('returns null when updateInfo is null', () => {
    const { container } = render(
      <UpdateNotification {...defaultProps} updateInfo={null} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders available state with version and buttons', () => {
    render(<UpdateNotification {...defaultProps} />);
    expect(screen.getByText('Update Available')).toBeDefined();
    expect(screen.getByText(/v2\.0\.0/)).toBeDefined();
    expect(screen.getByText('Update Now')).toBeDefined();
    expect(screen.getByText('Later')).toBeDefined();
  });

  it('renders what\'s new body in available state', () => {
    render(<UpdateNotification {...defaultProps} />);
    expect(screen.getByText('Bug fixes')).toBeDefined();
  });

  it('renders downloading state with progress', () => {
    render(
      <UpdateNotification
        {...defaultProps}
        status="downloading"
        downloadProgress={65}
      />
    );
    expect(screen.getByText('Downloading Update')).toBeDefined();
    expect(screen.getByText('65%')).toBeDefined();
  });

  it('renders ready state with restart button', () => {
    render(
      <UpdateNotification {...defaultProps} status="ready" />
    );
    expect(screen.getByText('Ready to Install')).toBeDefined();
    expect(screen.getByText('Restart Now')).toBeDefined();
  });

  it('renders error state with error message and retry', () => {
    render(
      <UpdateNotification
        {...defaultProps}
        status="error"
        error="Download failed"
      />
    );
    expect(screen.getByText('Update Failed')).toBeDefined();
    expect(screen.getByText('Download failed')).toBeDefined();
    expect(screen.getByText('Try Again')).toBeDefined();
  });

  it('calls onUpdate when Update Now clicked', () => {
    const onUpdate = vi.fn();
    render(<UpdateNotification {...defaultProps} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText('Update Now'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('calls onLater when Later clicked', () => {
    const onLater = vi.fn();
    render(<UpdateNotification {...defaultProps} onLater={onLater} />);
    fireEvent.click(screen.getByText('Later'));
    expect(onLater).toHaveBeenCalledTimes(1);
  });

  it('calls onRestart when Restart Now clicked', () => {
    const onRestart = vi.fn();
    render(
      <UpdateNotification {...defaultProps} status="ready" onRestart={onRestart} />
    );
    fireEvent.click(screen.getByText('Restart Now'));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('calls onRetry when Try Again clicked', () => {
    const onRetry = vi.fn();
    render(
      <UpdateNotification
        {...defaultProps}
        status="error"
        error="Failed"
        onRetry={onRetry}
      />
    );
    fireEvent.click(screen.getByText('Try Again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
