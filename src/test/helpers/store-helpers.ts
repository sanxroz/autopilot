/**
 * Store testing utilities.
 *
 * Provides helpers to reset the Zustand store between tests and to create
 * pre-populated store states for specific scenarios.
 */
import { useAppStore } from '../../store';
import { DEFAULT_GITHUB_SETTINGS, DEFAULT_PR_HUB_FILTERS } from '../../types/github';
import type { Repository, WorktreeInfo } from '../../types';
import type { GitHubSettings } from '../../types/github';

// ---------------------------------------------------------------------------
// Store state data type — the data fields (not actions) of the store.
// We extract this from the real store to stay in sync automatically.
// ---------------------------------------------------------------------------

type StoreState = ReturnType<typeof useAppStore.getState>;

/**
 * Pick only the data (non-function) keys from the store state.
 * This keeps `getInitialStoreState` type-safe against the real AppStore.
 */
type DataKeys = {
  [K in keyof StoreState]: StoreState[K] extends (...args: any[]) => any ? never : K;
}[keyof StoreState];

type StoreDataState = Pick<StoreState, DataKeys>;

// ---------------------------------------------------------------------------
// Initial (default) state snapshot — mirrors src/store/index.ts create() call
// ---------------------------------------------------------------------------

/**
 * The default state the store is initialised with (data fields only, no
 * actions). Keep this in sync with the `create<AppStore>()` call in
 * `src/store/index.ts`.
 */
export function getInitialStoreState(): StoreDataState {
  return {
    repositories: [],
    selectedWorktree: null,
    terminalsByWorktree: {},
    currentTerminals: [],
    currentActiveTerminalId: null,
    isInitialized: false,
    githubSettings: { ...DEFAULT_GITHUB_SETTINGS },
    prStatusByBranch: {},
    prDataCache: {},
    collapsedRepos: new Set<string>(),
    settingsOpen: false,
    codeReviewOpen: false,
    prHubOpen: false,
    diffOverlayOpen: false,
    diffViewMode: 'overlay',
    gitFileDiffPreview: null,
    processStatusByPath: {},
    agentRunByWorktreePath: {},
    agentSidebarLifecycleEnabled: true,
    defaultAIAgent: 'opencode',
    addressedComments: {},
    prHubData: {},
    assignedIssues: [],
    prHubFilters: { ...DEFAULT_PR_HUB_FILTERS },
  };
}

// ---------------------------------------------------------------------------
// Store reset
// ---------------------------------------------------------------------------

/**
 * Reset the Zustand store to its initial default state.
 *
 * Call this in `beforeEach` / `afterEach` to isolate tests.
 *
 * **Usage:**
 * ```ts
 * import { resetStore } from '../test/helpers/store-helpers';
 *
 * afterEach(() => { resetStore(); });
 * ```
 */
export function resetStore(): void {
  // Use partial setState (replace=false, the default) so Zustand keeps
  // the action methods intact while resetting all data fields.
  useAppStore.setState(getInitialStoreState());
}

// ---------------------------------------------------------------------------
// Partial state helpers
// ---------------------------------------------------------------------------

/**
 * Merge a partial state into the current store.  This is a thin wrapper
 * around `useAppStore.setState` with better ergonomics for tests.
 *
 * ```ts
 * setStoreState({ isInitialized: true, settingsOpen: true });
 * ```
 */
export function setStoreState(
  partial: Partial<ReturnType<typeof useAppStore.getState>>,
): void {
  useAppStore.setState(partial);
}

/**
 * Convenience getter for the current snapshot of the store.
 */
export function getStoreState() {
  return useAppStore.getState();
}

// ---------------------------------------------------------------------------
// Scenario builders
// ---------------------------------------------------------------------------

/**
 * Seed the store with a single repository and its worktrees so that tests
 * exercising repo-level features don't need boilerplate setup.
 */
export function seedRepository(opts?: {
  repoPath?: string;
  repoName?: string;
  avatarUrl?: string;
  worktrees?: WorktreeInfo[];
  isExpanded?: boolean;
}) {
  const repoPath = opts?.repoPath ?? '/mock/repo';
  const repoName = opts?.repoName ?? 'mock-repo';

  const worktrees: WorktreeInfo[] = opts?.worktrees ?? [
    {
      name: 'main',
      path: `${repoPath}/main`,
      branch: 'main',
      last_modified: '2025-01-01T00:00:00Z',
    },
  ];

  const repo: Repository = {
    info: {
      path: repoPath,
      name: repoName,
      ...(opts?.avatarUrl ? { avatarUrl: opts.avatarUrl } : {}),
    },
    worktrees,
    isExpanded: opts?.isExpanded ?? true,
  };

  const currentRepos = useAppStore.getState().repositories;
  useAppStore.setState({ repositories: [...currentRepos, repo] });

  return repo;
}

/**
 * Seed a selected worktree with a terminal, mimicking what happens after
 * `selectWorktree` completes.
 */
export function seedSelectedWorktree(opts?: {
  worktreePath?: string;
  worktreeName?: string;
  branch?: string | null;
  terminalId?: string;
}) {
  const worktreePath = opts?.worktreePath ?? '/mock/repo/main';
  const worktreeName = opts?.worktreeName ?? 'main';
  const branch = opts?.branch ?? 'main';
  const terminalId = opts?.terminalId ?? 'term-mock-1';

  const worktree = {
    name: worktreeName,
    path: worktreePath,
    branch,
    last_modified: '2025-01-01T00:00:00Z',
  };

  const terminal = {
    id: terminalId,
    worktreePath,
    worktreeName,
  };

  useAppStore.setState((state) => ({
    selectedWorktree: worktree,
    currentTerminals: [terminal],
    currentActiveTerminalId: terminalId,
    gitFileDiffPreview: null,
    terminalsByWorktree: {
      ...state.terminalsByWorktree,
      [worktreePath]: {
        terminals: [terminal],
        activeTerminalId: terminalId,
      },
    },
  }));

  return { worktree, terminal };
}

/**
 * Seed an initialized store with a repo and selected worktree — the common
 * "happy path" starting point for most component tests.
 */
export function seedInitializedState(opts?: {
  repoPath?: string;
  repoName?: string;
}) {
  const repoPath = opts?.repoPath ?? '/mock/repo';
  const repoName = opts?.repoName ?? 'mock-repo';

  resetStore();
  useAppStore.setState({ isInitialized: true });
  const repo = seedRepository({ repoPath, repoName });
  const { worktree, terminal } = seedSelectedWorktree({
    worktreePath: repo.worktrees[0].path,
    worktreeName: repo.worktrees[0].name,
    branch: repo.worktrees[0].branch,
  });

  return { repo, worktree, terminal };
}

/**
 * Seed GitHub settings so that GitHub-related features are testable.
 */
export function seedGitHubSettings(opts?: Partial<GitHubSettings>) {
  useAppStore.setState({
    githubSettings: {
      ...DEFAULT_GITHUB_SETTINGS,
      ghCliAvailable: true,
      ghAuthUser: 'mock-user',
      ...opts,
    },
  });
}
