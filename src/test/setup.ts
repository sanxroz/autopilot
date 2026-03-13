/**
 * Global test setup — loaded by Vitest via `setupFiles` in vitest.config.ts.
 */
import { vi, beforeEach } from 'vitest';

const originalConsoleError = console.error.bind(console);
const originalConsoleDebug = console.debug.bind(console);
const suppressedConsoleErrorPatterns = [
  /Not implemented: Window's scrollTo\(\) method/,
  /Failed to add repository:/,
  /Failed to create worktree:/,
  /Failed to check GitHub CLI:/,
  /Mock invoke error/,
  /Mock cleanup error/,
];

console.error = (...args: unknown[]) => {
  const message = args
    .map((arg) => {
      if (arg instanceof Error) return arg.stack || arg.message;
      return String(arg);
    })
    .join(' ');

  if (suppressedConsoleErrorPatterns.some((pattern) => pattern.test(message))) {
    return;
  }

  originalConsoleError(...args);
};

console.debug = (...args: unknown[]) => {
  const message = args.map((arg) => String(arg)).join(' ');

  if (message.includes('[agent-status]')) {
    return;
  }

  originalConsoleDebug(...args);
};

// ═══════════════════════════════════════════════════════════════════════════
// 1.  Module mocks (vi.mock calls are hoisted — no external refs allowed)
// ═══════════════════════════════════════════════════════════════════════════

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(async () => ({
    get: vi.fn(async () => undefined),
    set: vi.fn(async () => {}),
    save: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
  })),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => vi.fn()),
  emit: vi.fn(async () => {}),
  once: vi.fn(async () => vi.fn()),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(async () => '/mock/selected/path'),
  save: vi.fn(async () => '/mock/save/path'),
  message: vi.fn(async () => {}),
  ask: vi.fn(async () => true),
  confirm: vi.fn(async () => true),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: {
    create: vi.fn(() => ({
      execute: vi.fn(async () => ({ code: 0, stdout: '', stderr: '' })),
      spawn: vi.fn(async () => ({ pid: 12345 })),
      on: vi.fn(),
    })),
  },
  open: vi.fn(async () => {}),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(async () => {}),
  openPath: vi.fn(async () => {}),
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  exit: vi.fn(async () => {}),
  relaunch: vi.fn(async () => {}),
}));

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(async () => null),
}));

// ═══════════════════════════════════════════════════════════════════════════
// 2.  DOM environment stubs
// ═══════════════════════════════════════════════════════════════════════════

if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  } as unknown as typeof globalThis.ResizeObserver;
}

if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class IntersectionObserver {
    root = null;
    rootMargin = '0px';
    thresholds = [0];
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn().mockReturnValue([]);
  } as unknown as typeof globalThis.IntersectionObserver;
}

if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = vi.fn();
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'scrollTo', {
    writable: true,
    value: vi.fn(),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3.  Per-test reset
// ═══════════════════════════════════════════════════════════════════════════

beforeEach(() => {
  vi.clearAllMocks();
});
