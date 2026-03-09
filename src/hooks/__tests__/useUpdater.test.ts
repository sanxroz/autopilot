import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useUpdater } from '../useUpdater';

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(async () => null),
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(async () => {}),
}));

const mockCheck = vi.mocked(check);
const mockRelaunch = vi.mocked(relaunch);

describe('useUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with idle status', () => {
    const { result } = renderHook(() => useUpdater());

    expect(result.current.status).toBe('idle');
    expect(result.current.updateInfo).toBeNull();
    expect(result.current.downloadProgress).toBe(0);
    expect(result.current.error).toBeUndefined();
  });

  it('should set status to available when update found', async () => {
    const mockUpdate = {
      version: '2.0.0',
      body: 'New features',
      date: '2025-03-01T00:00:00Z',
      downloadAndInstall: vi.fn(),
    };
    mockCheck.mockResolvedValue(mockUpdate as any);

    const { result } = renderHook(() => useUpdater());

    // Manually trigger checkForUpdates instead of waiting for the 3s timer
    await act(async () => {
      await result.current.checkForUpdates();
    });

    expect(result.current.status).toBe('available');
    expect(result.current.updateInfo).toEqual({
      version: '2.0.0',
      body: 'New features',
      date: expect.any(String),
    });
  });

  it('should return null updateInfo when no update', async () => {
    mockCheck.mockResolvedValue(null);

    const { result } = renderHook(() => useUpdater());

    await act(async () => {
      await result.current.checkForUpdates();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.updateInfo).toBeNull();
  });

  it('should handle check failure silently', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCheck.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useUpdater());

    await act(async () => {
      await result.current.checkForUpdates();
    });

    // Should stay idle - errors are logged silently
    expect(result.current.status).toBe('idle');
    consoleSpy.mockRestore();
  });

  it('should downloadAndInstall and track progress', async () => {
    const mockDownloadAndInstall = vi.fn(async (onEvent: (event: any) => void) => {
      onEvent({ event: 'Started', data: { contentLength: 1000 } });
      onEvent({ event: 'Progress', data: { chunkLength: 500 } });
      onEvent({ event: 'Progress', data: { chunkLength: 500 } });
      onEvent({ event: 'Finished', data: {} });
    });

    const mockUpdate = {
      version: '2.0.0',
      body: null,
      date: null,
      downloadAndInstall: mockDownloadAndInstall,
    };
    mockCheck.mockResolvedValue(mockUpdate as any);

    const { result } = renderHook(() => useUpdater());

    await act(async () => {
      await result.current.checkForUpdates();
    });

    expect(result.current.status).toBe('available');

    await act(async () => {
      await result.current.downloadAndInstall();
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.downloadProgress).toBe(100);
  });

  it('should set error on download failure', async () => {
    const mockDownloadAndInstall = vi.fn(async () => {
      throw new Error('Download failed');
    });

    const mockUpdate = {
      version: '2.0.0',
      body: null,
      date: null,
      downloadAndInstall: mockDownloadAndInstall,
    };
    mockCheck.mockResolvedValue(mockUpdate as any);

    const { result } = renderHook(() => useUpdater());

    await act(async () => {
      await result.current.checkForUpdates();
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      await result.current.downloadAndInstall();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Download failed');
    consoleSpy.mockRestore();
  });

  it('should call relaunch on restart', async () => {
    const { result } = renderHook(() => useUpdater());

    await act(async () => {
      await result.current.restart();
    });

    expect(mockRelaunch).toHaveBeenCalledTimes(1);
  });

  it('should dismissUpdate and reset all state', async () => {
    const mockUpdate = {
      version: '2.0.0',
      body: 'Changes',
      date: null,
      downloadAndInstall: vi.fn(),
    };
    mockCheck.mockResolvedValue(mockUpdate as any);

    const { result } = renderHook(() => useUpdater());

    await act(async () => {
      await result.current.checkForUpdates();
    });

    expect(result.current.status).toBe('available');

    act(() => {
      result.current.dismissUpdate();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.updateInfo).toBeNull();
    expect(result.current.downloadProgress).toBe(0);
    expect(result.current.error).toBeUndefined();
  });
});
