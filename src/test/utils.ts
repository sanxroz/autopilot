/**
 * Test utilities and compatibility helpers for Vitest
 */
import { vi } from 'vitest';

/**
 * Compatibility wrapper for vi.mocked (if not available)
 */
export function mocked<T>(item: T): T {
  if (typeof vi.mocked === 'function') {
    return vi.mocked(item);
  }
  // Fallback for older Vitest versions
  return item as T;
}

/**
 * Compatibility wrapper for vi.hoisted (if not available)
 * Note: This function is currently not used but kept for future compatibility
 */
export function hoisted<T>(fn: () => T): T {
  // For now, just execute the function immediately
  // vi.hoisted is not available or not working properly in current Vitest setup
  return fn();
}

/**
 * Safe timer clearing that checks if the function exists
 */
export function clearAllTimers(): void {
  if (typeof vi.clearAllTimers === 'function') {
    vi.clearAllTimers();
  }
}

/**
 * Safe timer advancement that checks if the function exists
 */
export function advanceTimersByTime(ms: number): void {
  if (typeof vi.advanceTimersByTime === 'function') {
    vi.advanceTimersByTime(ms);
  } else if (typeof vi.runAllTimers === 'function') {
    vi.runAllTimers();
  }
}

/**
 * Async timer advancement compatibility wrapper
 */
export async function advanceTimersByTimeAsync(ms: number): Promise<void> {
  if (typeof (vi as any).advanceTimersByTimeAsync === 'function') {
    return (vi as any).advanceTimersByTimeAsync(ms);
  } else if (typeof vi.advanceTimersByTime === 'function') {
    vi.advanceTimersByTime(ms);
    // Wait a tick for any pending promises to resolve
    await new Promise(resolve => setTimeout(resolve, 0));
  } else if (typeof vi.runAllTimers === 'function') {
    vi.runAllTimers();
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

/**
 * Compatibility wrapper for vi.waitFor (if not available)
 */
export async function waitFor(
  callback: () => void | Promise<void>, 
  options?: { timeout?: number; interval?: number }
): Promise<void> {
  if (typeof vi.waitFor === 'function') {
    return vi.waitFor(callback, options);
  }
  
  // Fallback implementation
  const timeout = options?.timeout || 1000;
  const interval = options?.interval || 50;
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      await callback();
      return;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }
  
  // One final attempt
  await callback();
}

/**
 * Utility to create a properly typed mock function
 */
export function createMockFn<T extends (...args: any[]) => any>(
  implementation?: T
): ReturnType<typeof vi.fn> & T {
  const mockFn = vi.fn(implementation);
  return mockFn as ReturnType<typeof vi.fn> & T;
}

/**
 * Mock store instance compatible with Tauri store API
 */
export function createMockStore() {
  return {
    get: createMockFn(async () => undefined),
    set: createMockFn(async () => {}),
    save: createMockFn(async () => {}),
    delete: createMockFn(async () => {}),
    clear: createMockFn(async () => {}),
  };
}