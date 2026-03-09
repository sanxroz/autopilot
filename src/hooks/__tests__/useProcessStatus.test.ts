import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProcessStatusPolling } from '../useProcessStatus';
import { useAppStore } from '../../store';
import { resetStore, seedRepository, setStoreState } from '../../test/helpers/store-helpers';

const originalActions = {
  refreshProcessStatuses: useAppStore.getState().refreshProcessStatuses,
};

describe('useProcessStatusPolling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetStore();
    useAppStore.setState(originalActions as Partial<ReturnType<typeof useAppStore.getState>>);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    resetStore();
    useAppStore.setState(originalActions as Partial<ReturnType<typeof useAppStore.getState>>);
  });

  it('does nothing when not initialized', () => {
    const refreshProcessStatuses = vi.fn().mockResolvedValue(undefined);
    setStoreState({
      isInitialized: false,
      refreshProcessStatuses: refreshProcessStatuses as ReturnType<typeof useAppStore.getState>['refreshProcessStatuses'],
    });
    seedRepository();

    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    const setIntervalSpy = vi.spyOn(window, 'setInterval');

    renderHook(() => useProcessStatusPolling());

    expect(refreshProcessStatuses).toHaveBeenCalledTimes(0);
    expect(setIntervalSpy).toHaveBeenCalledTimes(0);
    expect(addEventListenerSpy).not.toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('does nothing when repositories are empty', () => {
    const refreshProcessStatuses = vi.fn().mockResolvedValue(undefined);
    setStoreState({
      isInitialized: true,
      repositories: [],
      refreshProcessStatuses: refreshProcessStatuses as ReturnType<typeof useAppStore.getState>['refreshProcessStatuses'],
    });

    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    const setIntervalSpy = vi.spyOn(window, 'setInterval');

    renderHook(() => useProcessStatusPolling());

    expect(refreshProcessStatuses).toHaveBeenCalledTimes(0);
    expect(setIntervalSpy).toHaveBeenCalledTimes(0);
    expect(addEventListenerSpy).not.toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('refreshes immediately on mount and polls every 3000ms while visible', () => {
    const refreshProcessStatuses = vi.fn().mockResolvedValue(undefined);
    setStoreState({
      isInitialized: true,
      refreshProcessStatuses: refreshProcessStatuses as ReturnType<typeof useAppStore.getState>['refreshProcessStatuses'],
    });
    seedRepository();

    renderHook(() => useProcessStatusPolling());

    expect(refreshProcessStatuses).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(refreshProcessStatuses).toHaveBeenCalledTimes(2);
  });

  it('skips interval polling when the document is hidden but refreshes on visibilitychange back to visible', () => {
    const refreshProcessStatuses = vi.fn().mockResolvedValue(undefined);
    setStoreState({
      isInitialized: true,
      refreshProcessStatuses: refreshProcessStatuses as ReturnType<typeof useAppStore.getState>['refreshProcessStatuses'],
    });
    seedRepository();

    renderHook(() => useProcessStatusPolling());

    expect(refreshProcessStatuses).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(refreshProcessStatuses).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(refreshProcessStatuses).toHaveBeenCalledTimes(2);
  });

  it('cleans up interval and visibility listener on unmount', () => {
    const refreshProcessStatuses = vi.fn().mockResolvedValue(undefined);
    setStoreState({
      isInitialized: true,
      refreshProcessStatuses: refreshProcessStatuses as ReturnType<typeof useAppStore.getState>['refreshProcessStatuses'],
    });
    seedRepository();

    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

    const { unmount } = renderHook(() => useProcessStatusPolling());

    expect(refreshProcessStatuses).toHaveBeenCalledTimes(1);

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(removeEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('starts polling when dependencies change from inactive to active', () => {
    const refreshProcessStatuses = vi.fn().mockResolvedValue(undefined);
    setStoreState({
      isInitialized: false,
      repositories: [],
      refreshProcessStatuses: refreshProcessStatuses as ReturnType<typeof useAppStore.getState>['refreshProcessStatuses'],
    });

    renderHook(() => useProcessStatusPolling());

    expect(refreshProcessStatuses).toHaveBeenCalledTimes(0);

    act(() => {
      setStoreState({ isInitialized: true });
      seedRepository({ repoPath: '/repo/activated' });
    });

    expect(refreshProcessStatuses).toHaveBeenCalledTimes(1);
  });
});
