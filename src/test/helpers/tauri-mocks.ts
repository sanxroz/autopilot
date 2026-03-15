/**
 * Mock factories for Tauri APIs and plugin modules.
 *
 * These helpers produce `vi.fn()` mocks with sensible defaults that can be
 * overridden on a per-test basis.  They are consumed by `src/test/setup.ts`
 * (global mocks) and can be imported directly for fine-grained control.
 */
import { vi } from 'vitest';
import type { RepoInfo, WorktreeInfo, ProcessStatus } from '../../types';

// ---------------------------------------------------------------------------
// @tauri-apps/api/core  —  invoke
// ---------------------------------------------------------------------------

/**
 * Default response map keyed by Tauri command name.
 * Tests can extend or override entries before calling `createInvokeMock()`.
 */
export const DEFAULT_INVOKE_RESPONSES: Record<string, unknown> = {
  discover_repository: {
    path: '/mock/repo',
    name: 'mock-repo',
  } satisfies RepoInfo,

  list_worktrees: [
    {
      name: 'main',
      path: '/mock/repo/main',
      branch: 'main',
      last_modified: '2025-01-01T00:00:00Z',
    },
  ] satisfies WorktreeInfo[],

  spawn_terminal: { terminal_id: 'term-mock-1' },
  spawn_terminal_with_command: { terminal_id: 'term-mock-cmd-1' },
  close_terminal: undefined,
  close_terminals_for_worktree: 0,

  check_gh_cli: true,
  check_gh_auth: 'mock-user',

  get_all_worktrees_process_status: {} satisfies Record<string, ProcessStatus>,
  get_worktree_branch_name: 'main',
  get_repo_from_remote: 'mock-owner/mock-repo',

  create_worktree_auto: {
    name: 'new-worktree',
    path: '/mock/repo/new-worktree',
    branch: 'feat/new',
    last_modified: null,
  } satisfies WorktreeInfo,

  delete_worktree: undefined,
};

/**
 * Create an `invoke` mock that resolves commands using the provided response
 * map (falls back to `DEFAULT_INVOKE_RESPONSES`).
 *
 * Unknown commands reject so tests surface missing stubs early.
 */
export function createInvokeMock(
  overrides: Record<string, unknown> = {},
) {
  const responses = { ...DEFAULT_INVOKE_RESPONSES, ...overrides };

  return vi.fn(async (cmd: string, _args?: Record<string, unknown>) => {
    if (cmd in responses) {
      const value = responses[cmd];
      // Support callable overrides for dynamic results
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown)(_args) : value;
    }
    throw new Error(`[tauri-mock] Unhandled invoke command: "${cmd}"`);
  });
}

// ---------------------------------------------------------------------------
// @tauri-apps/plugin-store  —  load
// ---------------------------------------------------------------------------

export interface MockStoreData {
  [key: string]: unknown;
}

/**
 * Creates a mock Tauri plugin-store instance with an in-memory backing map.
 *
 * The returned `store` object has `get`, `set`, `save`, `delete`, and `clear`
 * matching the real API surface used by the app.
 */
export function createMockStore(initial: MockStoreData = {}) {
  const data = new Map<string, unknown>(Object.entries(initial));

  const store = {
    get: vi.fn(async <T = unknown>(key: string): Promise<T | undefined> => {
      return data.get(key) as T | undefined;
    }),
    set: vi.fn(async (key: string, value: unknown): Promise<void> => {
      data.set(key, value);
    }),
    save: vi.fn(async (): Promise<void> => {}),
    delete: vi.fn(async (key: string): Promise<void> => {
      data.delete(key);
    }),
    clear: vi.fn(async (): Promise<void> => {
      data.clear();
    }),

    // Escape-hatch for assertions
    _data: data,
  };

  return store;
}

export type MockStore = ReturnType<typeof createMockStore>;

/**
 * Create the `load` function mock for `@tauri-apps/plugin-store`.
 *
 * Each call to `load()` returns the *same* store instance so the app's
 * multiple `load(STORE_PATH, …)` calls share state, just like the real thing.
 */
export function createLoadMock(storeInstance?: MockStore) {
  const store = storeInstance ?? createMockStore();
  return {
    load: vi.fn(async () => store),
    store,
  };
}

// ---------------------------------------------------------------------------
// @tauri-apps/api/event  —  listen / emit
// ---------------------------------------------------------------------------

export function createEventMock() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();

  const listen = vi.fn(async (event: string, handler: (event: unknown) => void) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(handler);
    // Return unlisten function
    return vi.fn(() => {
      listeners.get(event)?.delete(handler);
    });
  });

  const emit = vi.fn(async (event: string, payload?: unknown) => {
    listeners.get(event)?.forEach((fn) => fn({ event, payload }));
  });

  const once = vi.fn(async (event: string, handler: (event: unknown) => void) => {
    const wrappedHandler = (e: unknown) => {
      handler(e);
      listeners.get(event)?.delete(wrappedHandler);
    };
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(wrappedHandler);
    return vi.fn(() => {
      listeners.get(event)?.delete(wrappedHandler);
    });
  });

  return { listen, emit, once, _listeners: listeners };
}

// ---------------------------------------------------------------------------
// @tauri-apps/plugin-dialog
// ---------------------------------------------------------------------------

export function createDialogMock() {
  return {
    open: vi.fn(async () => '/mock/selected/path'),
    save: vi.fn(async () => '/mock/save/path'),
    message: vi.fn(async () => {}),
    ask: vi.fn(async () => true),
    confirm: vi.fn(async () => true),
  };
}

// ---------------------------------------------------------------------------
// @tauri-apps/plugin-shell
// ---------------------------------------------------------------------------

export function createShellMock() {
  return {
    Command: {
      create: vi.fn(() => ({
        execute: vi.fn(async () => ({ code: 0, stdout: '', stderr: '' })),
        spawn: vi.fn(async () => ({ pid: 12345 })),
        on: vi.fn(),
      })),
    },
    open: vi.fn(async () => {}),
  };
}

// ---------------------------------------------------------------------------
// @tauri-apps/plugin-opener
// ---------------------------------------------------------------------------

export function createOpenerMock() {
  return {
    openUrl: vi.fn(async () => {}),
    openPath: vi.fn(async () => {}),
  };
}

// ---------------------------------------------------------------------------
// @tauri-apps/plugin-process
// ---------------------------------------------------------------------------

export function createProcessMock() {
  return {
    exit: vi.fn(async () => {}),
    relaunch: vi.fn(async () => {}),
  };
}

// ---------------------------------------------------------------------------
// @tauri-apps/plugin-updater
// ---------------------------------------------------------------------------

export function createUpdaterMock() {
  return {
    check: vi.fn(async () => null),
  };
}

// ---------------------------------------------------------------------------
// Convenience: all mocks bundled
// ---------------------------------------------------------------------------

export interface AllTauriMocks {
  invoke: ReturnType<typeof createInvokeMock>;
  store: MockStore;
  load: ReturnType<typeof createLoadMock>['load'];
  event: ReturnType<typeof createEventMock>;
  dialog: ReturnType<typeof createDialogMock>;
  shell: ReturnType<typeof createShellMock>;
  opener: ReturnType<typeof createOpenerMock>;
  process: ReturnType<typeof createProcessMock>;
  updater: ReturnType<typeof createUpdaterMock>;
}

/**
 * Creates a complete set of Tauri mocks. Useful for tests that need to access
 * multiple mock instances.
 */
export function createAllTauriMocks(
  invokeOverrides?: Record<string, unknown>,
  storeInitial?: MockStoreData,
): AllTauriMocks {
  const store = createMockStore(storeInitial);
  const loadMock = createLoadMock(store);

  return {
    invoke: createInvokeMock(invokeOverrides),
    store,
    load: loadMock.load,
    event: createEventMock(),
    dialog: createDialogMock(),
    shell: createShellMock(),
    opener: createOpenerMock(),
    process: createProcessMock(),
    updater: createUpdaterMock(),
  };
}
