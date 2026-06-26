import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { load } from '@tauri-apps/plugin-store';
import { toast } from 'sonner';
import type {
  Repository,
  RepoInfo,
  WorktreeInfo,
  TerminalInstance,
  ProcessStatus,
  DiffViewMode,
  AIAgent,
  AgentRunState,
  AgentStatusEvent,
} from '../types';
import type {
  GitHubSettings,
  GithubIssue,
  PRStatus,
  PRChecksResult,
  PRDetailedInfo,
  PRHubFilters,
  RepoPRStatuses,
} from '../types/github';
import { DEFAULT_GITHUB_SETTINGS, DEFAULT_PR_HUB_FILTERS } from '../types/github';
import { setThemeMode as setGlobalThemeMode, getThemeMode, type ThemeMode } from '../theme';

interface PersistedState {
  repositoryPaths: string[];
  defaultAIAgent?: AIAgent;
  repoAvatarCache?: Record<string, string>;
  prHubFilters?: PRHubFilters;
  worktreeOrdersByRepo?: Record<string, string[]>;
}

interface WorktreeTerminals {
  terminals: TerminalInstance[];
  activeTerminalId: string | null;
}

interface PRDataCache {
  checksResult: PRChecksResult | null;
  prDetails: PRDetailedInfo | null;
  lastUpdated: number;
}

type AddressedCommentsMap = Record<string, Set<string>>;

interface AppStore {
  repositories: Repository[];
  selectedWorktree: WorktreeInfo | null;
  terminalsByWorktree: Record<string, WorktreeTerminals>;
  currentTerminals: TerminalInstance[];
  currentActiveTerminalId: string | null;
  isInitialized: boolean;
  githubSettings: GitHubSettings;
  prStatusByBranch: Record<string, Record<string, PRStatus>>;
  prDataCache: Record<string, PRDataCache>;
  worktreeOrdersByRepo: Record<string, string[]>;
  collapsedRepos: Set<string>;
  settingsOpen: boolean;
  codeReviewOpen: boolean;
  prHubOpen: boolean;
  diffOverlayOpen: boolean;
  diffViewMode: DiffViewMode;
  gitFileDiffPreview: { filePath: string; worktreePath: string; isStaged: boolean } | null;
  processStatusByPath: Record<string, ProcessStatus>;
  agentRunByWorktreePath: Record<string, AgentRunState | undefined>;
  agentSidebarLifecycleEnabled: boolean;
  defaultAIAgent: AIAgent;
  addressedComments: AddressedCommentsMap;
  prHubData: Record<string, PRStatus[]>;
  assignedIssues: GithubIssue[];

  prHubFilters: PRHubFilters;

  initialize: () => Promise<void>;
  addRepository: (path: string) => Promise<void>;
  removeRepository: (path: string) => void;
  toggleRepoExpanded: (path: string) => void;
  refreshWorktrees: (repoPath: string) => Promise<void>;
  reorderWorktrees: (repoPath: string, orderedWorktreePaths: string[]) => Promise<void>;
  updateWorktreeBranch: (worktreePath: string) => Promise<void>;
  selectWorktree: (worktree: WorktreeInfo) => Promise<void>;
  addTerminal: () => Promise<string | null>;
  addTerminalWithCommand: (command: string) => Promise<string | null>;
  removeTerminal: (terminalId: string) => void;
  setActiveTerminal: (terminalId: string) => void;
  toggleRepoCollapsed: (path: string) => void;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  toggleSettings: () => void;
  setCodeReviewOpen: (open: boolean) => void;
  toggleCodeReview: () => void;
  setPRHubOpen: (open: boolean) => void;
  togglePRHub: () => void;
  setPRHubData: (data: Record<string, PRStatus[]>) => void;
  setAssignedIssues: (issues: GithubIssue[]) => void;

  setPRHubFilters: (filters: Partial<PRHubFilters>) => Promise<void>;
  setDiffOverlayOpen: (open: boolean) => void;
  toggleDiffOverlay: () => void;
  setDiffViewMode: (mode: DiffViewMode) => void;
  setGitFileDiffPreview: (preview: { filePath: string; worktreePath: string; isStaged: boolean } | null) => void;
  toggleDiffViewMode: () => void;
  createWorktreeAuto: (repoPath: string) => Promise<WorktreeInfo | null>;
  deleteWorktree: (repoPath: string, worktreeName: string) => Promise<void>;
  setPRStatusBatch: (results: RepoPRStatuses[]) => void;
  setPRDataCache: (repoPath: string, prNumber: number, data: { checksResult?: PRChecksResult | null; prDetails?: PRDetailedInfo | null }) => void;
  getPRDataCache: (repoPath: string, prNumber: number) => PRDataCache | null;
  clearPRDataCacheForRepo: (repoPath: string) => void;
  checkGitHubCli: () => Promise<void>;
  refreshProcessStatuses: () => Promise<void>;
  getProcessStatus: (worktreePath: string) => ProcessStatus;
  setAgentRunState: (event: AgentStatusEvent) => void;
  clearAgentRunState: (worktreePath: string) => void;
  markAgentRunError: (worktreePath: string, error: string) => void;
  reconcileAgentRunWithProcessPolling: (worktreePath: string, processStatus: ProcessStatus) => void;
  setDefaultAIAgent: (agent: AIAgent) => Promise<void>;
  updateWorktreeDiffStats: (stats: Array<{ path: string; diff_stats: { additions: number; deletions: number } | null }>) => void;
  toggleAddressedComment: (repoPath: string, prNumber: number, commentId: string) => void;
  isCommentAddressed: (repoPath: string, prNumber: number, commentId: string) => boolean;
  getAddressedCount: (repoPath: string, prNumber: number) => number;
  clearAddressedComments: (repoPath: string, prNumber: number) => void;
}

const STORE_PATH = 'autopilot-settings.json';
const AGENT_COMPLETED_TTL_MS = 5000;

const KNOWN_AGENTS: AIAgent[] = ['opencode', 'claude', 'droid', 'amp', 'codex'];

function isKnownAgent(value: string | undefined): value is AIAgent {
  return !!value && KNOWN_AGENTS.includes(value as AIAgent);
}

function isAgentActiveStatus(status: AgentRunState['status']): boolean {
  return status === 'starting' || status === 'running' || status === 'waiting_input';
}

function getWorktreeSortTimestamp(worktree: WorktreeInfo): number {
  return worktree.last_modified ? new Date(worktree.last_modified).getTime() : 0;
}

function hasWorktreeChanges(worktree: WorktreeInfo): boolean {
  return (worktree.diff_stats?.additions ?? 0) + (worktree.diff_stats?.deletions ?? 0) > 0;
}

function normalizeWorktreeOrder(worktrees: WorktreeInfo[], orderedWorktreePaths: string[] | undefined): string[] {
  if (!orderedWorktreePaths?.length) return [];

  const existingPaths = new Set(
    worktrees.filter((worktree) => worktree.name !== 'main').map((worktree) => worktree.path)
  );

  return orderedWorktreePaths.filter((path) => existingPaths.has(path));
}

function orderWorktrees(
  worktrees: WorktreeInfo[],
  orderedWorktreePaths: string[] | undefined,
  stableWorktreePaths?: string[]
): WorktreeInfo[] {
  const normalizedOrder = normalizeWorktreeOrder(worktrees, orderedWorktreePaths);
  const orderIndex = new Map(normalizedOrder.map((path, index) => [path, index]));
  const stableOrderIndex = new Map(stableWorktreePaths?.map((path, index) => [path, index]) ?? []);
  const mainWorktrees = worktrees.filter((worktree) => worktree.name === 'main');
  const branchWorktrees = worktrees
    .filter((worktree) => worktree.name !== 'main')
    .sort((a, b) => {
      const aIndex = orderIndex.get(a.path);
      const bIndex = orderIndex.get(b.path);

      if (aIndex !== undefined && bIndex !== undefined) {
        return aIndex - bIndex;
      }

      if (aIndex !== undefined) return -1;
      if (bIndex !== undefined) return 1;

      const changeRankDelta = Number(hasWorktreeChanges(b)) - Number(hasWorktreeChanges(a));
      if (changeRankDelta !== 0) return changeRankDelta;

      const aStableIndex = stableOrderIndex.get(a.path);
      const bStableIndex = stableOrderIndex.get(b.path);
      if (aStableIndex !== undefined && bStableIndex !== undefined) {
        return aStableIndex - bStableIndex;
      }
      if (aStableIndex !== undefined) return -1;
      if (bStableIndex !== undefined) return 1;

      const timestampDelta = getWorktreeSortTimestamp(b) - getWorktreeSortTimestamp(a);
      if (timestampDelta !== 0) return timestampDelta;

      return a.path.localeCompare(b.path);
    });

  return [...mainWorktrees, ...branchWorktrees];
}

function reconcileOneAgentRunState(
  _path: string,
  processStatus: ProcessStatus,
  currentState: AgentRunState | undefined,
  now: number
): AgentRunState | undefined {
  if (processStatus === 'agent_running') {
    // Don't create lifecycle state from process polling alone.
    // Lifecycle is driven by hooks (for hook-enabled agents) or
    // the inactivity watchdog (for others). Process polling can only
    // keep existing state alive — never fabricate new state.
    return currentState;
  }

  if (!currentState) return undefined;

  // Agent process is gone — mark completed immediately.
  // If process detection is briefly wrong, hooks will restore the correct
  // state on the next event.
  if (isAgentActiveStatus(currentState.status)) {
    return {
      ...currentState,
      status: 'completed',
      lastEventAt: now,
      endedAt: now,
      label: 'Agent process exited',
    };
  }

  if ((currentState.status === 'completed' || currentState.status === 'error') && currentState.endedAt) {
    if (now - currentState.endedAt > AGENT_COMPLETED_TTL_MS) {
      return undefined;
    }
  }

  return currentState;
}

async function loadPersistedState(): Promise<PersistedState & { themeMode?: ThemeMode; addressedComments?: AddressedCommentsMap }> {
  try {
    const store = await load(STORE_PATH, { autoSave: true, defaults: {} });
    const paths = await store.get<string[]>('repositoryPaths');
    const themeMode = await store.get<ThemeMode>('themeMode');
    const defaultAIAgent = await store.get<AIAgent>('defaultAIAgent');
    const repoAvatarCache = await store.get<Record<string, string>>('repoAvatarCache');
    const prHubFilters = await store.get<PRHubFilters>('prHubFilters');
    const worktreeOrdersByRepo = await store.get<Record<string, string[]>>('worktreeOrdersByRepo');
    const rawAddressed = await store.get<Record<string, string[]>>('addressedComments');
    let addressedComments: AddressedCommentsMap | undefined;
    if (rawAddressed) {
      addressedComments = {};
      for (const [key, arr] of Object.entries(rawAddressed)) {
        addressedComments[key] = new Set(arr);
      }
    }
    return {
      repositoryPaths: paths || [],
      themeMode,
      defaultAIAgent,
      addressedComments,
      repoAvatarCache: repoAvatarCache || {},
      prHubFilters,
      worktreeOrdersByRepo: worktreeOrdersByRepo || {},
    };
  } catch {
    return { repositoryPaths: [], repoAvatarCache: {}, worktreeOrdersByRepo: {} };
  }
}

async function savePersistedState(state: PersistedState): Promise<void> {
  try {
    const store = await load(STORE_PATH, { autoSave: true, defaults: {} });
    await store.set('repositoryPaths', state.repositoryPaths);
    await store.save();
  } catch (e) {
    console.error('Failed to save state:', e);
  }
}

async function saveWorktreeOrdersByRepo(worktreeOrdersByRepo: Record<string, string[]>): Promise<void> {
  try {
    const store = await load(STORE_PATH, { autoSave: true, defaults: {} });
    await store.set('worktreeOrdersByRepo', worktreeOrdersByRepo);
    await store.save();
  } catch (e) {
    console.error('Failed to save worktree order state:', e);
  }
}
async function saveAddressedComments(addressedComments: AddressedCommentsMap): Promise<void> {
  try {
    const store = await load(STORE_PATH, { autoSave: true, defaults: {} });
    const serialized: Record<string, string[]> = {};
    for (const [key, set] of Object.entries(addressedComments)) {
      serialized[key] = Array.from(set);
    }
    await store.set('addressedComments', serialized);
    await store.save();
  } catch (e) {
    console.error('Failed to save addressed comments:', e);
  }
}

async function savePRHubFilters(prHubFilters: PRHubFilters): Promise<void> {
  try {
    const store = await load(STORE_PATH, { autoSave: true, defaults: {} });
    await store.set('prHubFilters', prHubFilters);
    await store.save();
  } catch (e) {
    console.error('Failed to save PR Hub filters:', e);
  }
}

async function saveRepoAvatarCacheEntry(repoPath: string, avatarUrl: string | null): Promise<void> {
  try {
    const store = await load(STORE_PATH, { autoSave: true, defaults: {} });
    const existing = (await store.get<Record<string, string>>('repoAvatarCache')) || {};

    if (avatarUrl) {
      existing[repoPath] = avatarUrl;
    } else {
      delete existing[repoPath];
    }

    await store.set('repoAvatarCache', existing);
    await store.save();
  } catch (e) {
    console.error('Failed to save repo avatar cache:', e);
  }
}

async function fetchRepoAvatarUrl(repoPath: string): Promise<string | null> {
  try {
    const nameWithOwner = await invoke<string | null>('get_repo_from_remote', { repoPath });
    if (!nameWithOwner) {
      return null;
    }

    const [owner] = nameWithOwner.split('/');
    if (!owner) {
      return null;
    }

    return `https://github.com/${owner}.png?size=64`;
  } catch {
    return null;
  }
}

export const useAppStore = create<AppStore>((set, get) => ({
  repositories: [],
  selectedWorktree: null,
  terminalsByWorktree: {},
  currentTerminals: [],
  currentActiveTerminalId: null,
  isInitialized: false,
  githubSettings: DEFAULT_GITHUB_SETTINGS,
  prStatusByBranch: {},
  prDataCache: {},
  worktreeOrdersByRepo: {},
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

  prHubFilters: DEFAULT_PR_HUB_FILTERS,

  initialize: async () => {
    if (get().isInitialized) return;

    const persisted = await loadPersistedState();
    
    if (persisted.themeMode) {
      setGlobalThemeMode(persisted.themeMode);
    }

    if (persisted.defaultAIAgent) {
      set({ defaultAIAgent: persisted.defaultAIAgent });
    }

    if (persisted.addressedComments) {
      set({ addressedComments: persisted.addressedComments });
    }

    if (persisted.prHubFilters) {
      set({ prHubFilters: { ...DEFAULT_PR_HUB_FILTERS, ...persisted.prHubFilters } });
    }

    if (persisted.worktreeOrdersByRepo) {
      set({ worktreeOrdersByRepo: persisted.worktreeOrdersByRepo });
    }
    
    const repoAvatarCache = persisted.repoAvatarCache || {};
    const reposNeedingAvatar: string[] = [];

    for (const path of persisted.repositoryPaths) {
      try {
        const discovered = await invoke<RepoInfo>('discover_repository', { path });
        const cachedAvatarUrl = repoAvatarCache[discovered.path] || repoAvatarCache[path];
        const info = cachedAvatarUrl ? { ...discovered, avatarUrl: cachedAvatarUrl } : discovered;
        const worktrees = orderWorktrees(
          await invoke<WorktreeInfo[]>('list_worktrees', { repoPath: info.path }),
          persisted.worktreeOrdersByRepo?.[info.path]
        );

        if (!cachedAvatarUrl) {
          reposNeedingAvatar.push(info.path);
        }

        set((state) => ({
          repositories: [
            ...state.repositories.filter((r) => r.info.path !== info.path),
            { info, worktrees, isExpanded: true },
          ],
        }));
      } catch (e) {
        console.error(`Failed to load repository ${path}:`, e);
      }
    }

    set({ isInitialized: true });

    if (reposNeedingAvatar.length > 0) {
      void Promise.allSettled(
        reposNeedingAvatar.map(async (repoPath) => {
          const avatarUrl = await fetchRepoAvatarUrl(repoPath);
          if (!avatarUrl) return;

          set((state) => ({
            repositories: state.repositories.map((repo) =>
              repo.info.path === repoPath
                ? { ...repo, info: { ...repo.info, avatarUrl } }
                : repo
            ),
          }));

          await saveRepoAvatarCacheEntry(repoPath, avatarUrl);
        })
      );
    }
    
    get().checkGitHubCli();
  },

  addRepository: async (path: string) => {
    try {
      const persisted = await loadPersistedState();
      const discovered = await invoke<RepoInfo>('discover_repository', { path });
      const cachedAvatarUrl = persisted.repoAvatarCache?.[discovered.path] || persisted.repoAvatarCache?.[path];
      const info = cachedAvatarUrl ? { ...discovered, avatarUrl: cachedAvatarUrl } : discovered;
      const worktrees = orderWorktrees(
        await invoke<WorktreeInfo[]>('list_worktrees', { repoPath: info.path }),
        get().worktreeOrdersByRepo[info.path] ?? persisted.worktreeOrdersByRepo?.[info.path]
      );

      set((state) => {
        const newRepos = [
          ...state.repositories.filter((r) => r.info.path !== info.path),
          { info, worktrees, isExpanded: true },
        ];
        
        savePersistedState({ repositoryPaths: newRepos.map((r) => r.info.path) });
        
        return { repositories: newRepos };
      });

      if (!cachedAvatarUrl) {
        void (async () => {
          const avatarUrl = await fetchRepoAvatarUrl(info.path);
          if (!avatarUrl) return;

          set((state) => ({
            repositories: state.repositories.map((repo) =>
              repo.info.path === info.path
                ? { ...repo, info: { ...repo.info, avatarUrl } }
                : repo
            ),
          }));

          await saveRepoAvatarCacheEntry(info.path, avatarUrl);
        })();
      }
    } catch (e) {
      console.error('Failed to add repository:', e);
      throw e;
    }
  },

  removeRepository: (path: string) => {
    set((state) => {
      const newRepos = state.repositories.filter((r) => r.info.path !== path);
      const { [path]: _removedOrder, ...remainingWorktreeOrders } = state.worktreeOrdersByRepo;
      savePersistedState({ repositoryPaths: newRepos.map((r) => r.info.path) });
      saveWorktreeOrdersByRepo(remainingWorktreeOrders);
      saveRepoAvatarCacheEntry(path, null);
      return {
        repositories: newRepos,
        worktreeOrdersByRepo: remainingWorktreeOrders,
      };
    });
  },

  toggleRepoExpanded: (path: string) => {
    set((state) => ({
      repositories: state.repositories.map((r) =>
        r.info.path === path ? { ...r, isExpanded: !r.isExpanded } : r
      ),
    }));
  },

  refreshWorktrees: async (repoPath: string) => {
    const rawWorktrees = await invoke<WorktreeInfo[]>('list_worktrees', { repoPath });
    const previousWorktrees = get().repositories.find((repo) => repo.info.path === repoPath)?.worktrees ?? [];
    const stableOrder = previousWorktrees.map((worktree) => worktree.path);
    let nextWorktreeOrders: Record<string, string[]> | null = null;

    set((state) => {
      const currentOrder = state.worktreeOrdersByRepo[repoPath];
      const normalizedOrder = normalizeWorktreeOrder(rawWorktrees, currentOrder);
      const worktrees = orderWorktrees(rawWorktrees, normalizedOrder, stableOrder);
      const orderChanged =
        (currentOrder?.length ?? 0) !== normalizedOrder.length ||
        (currentOrder?.some((path, index) => path !== normalizedOrder[index]) ?? false);
      nextWorktreeOrders = orderChanged
        ? { ...state.worktreeOrdersByRepo, [repoPath]: normalizedOrder }
        : null;

      return {
        repositories: state.repositories.map((r) =>
          r.info.path === repoPath ? { ...r, worktrees } : r
        ),
        worktreeOrdersByRepo: nextWorktreeOrders ?? state.worktreeOrdersByRepo,
      };
    });

    if (nextWorktreeOrders) {
      await saveWorktreeOrdersByRepo(nextWorktreeOrders);
    }
  },

  reorderWorktrees: async (repoPath: string, orderedWorktreePaths: string[]) => {
    const nextOrder = [...orderedWorktreePaths];

    set((state) => ({
      repositories: state.repositories.map((repo) =>
        repo.info.path === repoPath
          ? { ...repo, worktrees: orderWorktrees(repo.worktrees, nextOrder) }
          : repo
      ),
      worktreeOrdersByRepo: {
        ...state.worktreeOrdersByRepo,
        [repoPath]: nextOrder,
      },
    }));

    await saveWorktreeOrdersByRepo(get().worktreeOrdersByRepo);
  },

  updateWorktreeBranch: async (worktreePath: string) => {
    const branch = await invoke<string | null>('get_worktree_branch_name', { worktreePath });
    set((state) => ({
      repositories: state.repositories.map((repo) => ({
        ...repo,
        worktrees: repo.worktrees.map((wt) =>
          wt.path === worktreePath ? { ...wt, branch } : wt
        ),
      })),
      selectedWorktree: state.selectedWorktree?.path === worktreePath
        ? { ...state.selectedWorktree, branch }
        : state.selectedWorktree,
    }));
  },

  selectWorktree: async (worktree: WorktreeInfo) => {
    const state = get();
    
    if (state.selectedWorktree?.path === worktree.path) return;

    const existing = state.terminalsByWorktree[worktree.path];
    
    if (existing && existing.terminals.length > 0) {
      set({
        selectedWorktree: worktree,
        currentTerminals: existing.terminals,
        currentActiveTerminalId: existing.activeTerminalId,
        gitFileDiffPreview: null,
      });
      return;
    }

    const result = await invoke<{ terminal_id: string }>('spawn_terminal', {
      cwd: worktree.path,
      cols: 80,
      rows: 24,
      isDarkMode: getThemeMode() === 'dark',
    });

    const terminal: TerminalInstance = {
      id: result.terminal_id,
      worktreePath: worktree.path,
      worktreeName: worktree.name,
    };

    set((state) => ({
      selectedWorktree: worktree,
      currentTerminals: [terminal],
      currentActiveTerminalId: terminal.id,
      gitFileDiffPreview: null,
      terminalsByWorktree: {
        ...state.terminalsByWorktree,
        [worktree.path]: {
          terminals: [terminal],
          activeTerminalId: terminal.id,
        },
      },
    }));
  },

  addTerminal: async () => {
    const state = get();
    const worktree = state.selectedWorktree;
    if (!worktree) return null;

    const result = await invoke<{ terminal_id: string }>('spawn_terminal', {
      cwd: worktree.path,
      cols: 80,
      rows: 24,
      isDarkMode: getThemeMode() === 'dark',
    });

    const terminal: TerminalInstance = {
      id: result.terminal_id,
      worktreePath: worktree.path,
      worktreeName: worktree.name,
    };

    set((state) => {
      const newTerminals = [...state.currentTerminals, terminal];
      return {
        currentTerminals: newTerminals,
        currentActiveTerminalId: terminal.id,
        terminalsByWorktree: {
          ...state.terminalsByWorktree,
          [worktree.path]: {
            terminals: newTerminals,
            activeTerminalId: terminal.id,
          },
        },
      };
    });

    return terminal.id;
  },

  addTerminalWithCommand: async (command: string) => {
    const state = get();
    const worktree = state.selectedWorktree;
    if (!worktree) return null;

    const result = await invoke<{ terminal_id: string }>('spawn_terminal_with_command', {
      cwd: worktree.path,
      command,
      args: [],
      cols: 80,
      rows: 24,
      isDarkMode: getThemeMode() === 'dark',
    });

    const terminal: TerminalInstance = {
      id: result.terminal_id,
      worktreePath: worktree.path,
      worktreeName: worktree.name,
    };

    set((state) => {
      const newTerminals = [...state.currentTerminals, terminal];
      return {
        currentTerminals: newTerminals,
        currentActiveTerminalId: terminal.id,
        terminalsByWorktree: {
          ...state.terminalsByWorktree,
          [worktree.path]: {
            terminals: newTerminals,
            activeTerminalId: terminal.id,
          },
        },
      };
    });

    return terminal.id;
  },

  removeTerminal: (terminalId: string) => {
    invoke('close_terminal', { terminalId }).catch(console.error);

    const state = get();
    const worktree = state.selectedWorktree;
    if (!worktree) return;

    set((state) => {
      const newTerminals = state.currentTerminals.filter((t) => t.id !== terminalId);
      const newActiveId = state.currentActiveTerminalId === terminalId
        ? newTerminals[newTerminals.length - 1]?.id || null
        : state.currentActiveTerminalId;

      return {
        currentTerminals: newTerminals,
        currentActiveTerminalId: newActiveId,
        terminalsByWorktree: {
          ...state.terminalsByWorktree,
          [worktree.path]: {
            terminals: newTerminals,
            activeTerminalId: newActiveId,
          },
        },
      };
    });
  },

  setActiveTerminal: (terminalId: string) => {
    const state = get();
    const worktree = state.selectedWorktree;
    if (!worktree) return;

    set((state) => ({
      currentActiveTerminalId: terminalId,
      terminalsByWorktree: {
        ...state.terminalsByWorktree,
        [worktree.path]: {
          ...state.terminalsByWorktree[worktree.path],
          activeTerminalId: terminalId,
        },
      },
    }));
  },

  toggleRepoCollapsed: (path: string) => {
    set((state) => {
      const newCollapsed = new Set(state.collapsedRepos);
      if (newCollapsed.has(path)) {
        newCollapsed.delete(path);
      } else {
        newCollapsed.add(path);
      }
      return { collapsedRepos: newCollapsed };
    });
  },

  setThemeMode: async (mode: ThemeMode) => {
    setGlobalThemeMode(mode);
    try {
      const store = await load(STORE_PATH, { autoSave: true, defaults: {} });
      await store.set('themeMode', mode);
      await store.save();
    } catch (e) {
      console.error('Failed to save theme mode:', e);
    }
  },

  toggleSettings: () => {
    set((state) => ({ settingsOpen: !state.settingsOpen }));
  },

  setCodeReviewOpen: (open: boolean) => {
    set({ codeReviewOpen: open });
  },

  toggleCodeReview: () => {
    set((state) => ({ codeReviewOpen: !state.codeReviewOpen }));
  },

  setPRHubOpen: (open: boolean) => {
    set({ prHubOpen: open });
  },

  togglePRHub: () => {
    set((state) => ({ prHubOpen: !state.prHubOpen }));
  },

  setPRHubData: (data: Record<string, PRStatus[]>) => {
    set({ prHubData: data });
  },

  setAssignedIssues: (issues: GithubIssue[]) => {
    set({ assignedIssues: issues });
  },



  setPRHubFilters: async (filters: Partial<PRHubFilters>) => {
    const next = { ...get().prHubFilters, ...filters };
    set({ prHubFilters: next });
    await savePRHubFilters(next);
  },

  setDiffOverlayOpen: (open: boolean) => {
    set({ diffOverlayOpen: open });
  },

  toggleDiffOverlay: () => {
    set((state) => ({ diffOverlayOpen: !state.diffOverlayOpen }));
  },

  setDiffViewMode: (mode: DiffViewMode) => {
    set({ diffViewMode: mode });
  },

  setGitFileDiffPreview: (preview) => {
    set({ gitFileDiffPreview: preview });
  },

  toggleDiffViewMode: () => {
    set((state) => ({ diffViewMode: state.diffViewMode === 'overlay' ? 'sidebar' : 'overlay' }));
  },

  createWorktreeAuto: async (repoPath: string) => {
    try {
      const worktree = await invoke<WorktreeInfo>('create_worktree_auto', { repoPath });
      await get().refreshWorktrees(repoPath);
      return worktree;
    } catch (e) {
      console.error('Failed to create worktree:', e);
      throw e;
    }
  },

  deleteWorktree: async (repoPath: string, worktreeName: string) => {
    const state = get();
    const repo = state.repositories.find((r) => r.info.path === repoPath);
    const worktree = repo?.worktrees.find((wt) => wt.name === worktreeName);
    if (!worktree) return;

    set((s) => ({
      repositories: s.repositories.map((r) =>
        r.info.path === repoPath
          ? { ...r, worktrees: r.worktrees.filter((wt) => wt.name !== worktreeName) }
          : r
      ),
      selectedWorktree:
        s.selectedWorktree?.path === worktree.path ? null : s.selectedWorktree,
    }));

    try {
      try {
        await invoke<number>('close_terminals_for_worktree', { worktreePath: worktree.path });
      } catch (e) {
        console.error('Failed to close terminals for worktree:', e);
      }

      await invoke('delete_worktree', { repoPath, worktreeName, force: true });

      toast.success(`Worktree "${worktreeName}" deleted`);

      get().refreshWorktrees(repoPath);
    } catch (e) {
      set((s) => ({
        repositories: s.repositories.map((r) =>
          r.info.path === repoPath
            ? { ...r, worktrees: [...r.worktrees, worktree] }
            : r
        ),
      }));

      toast.error(`Failed to delete worktree: ${e}`);
      console.error('Failed to delete worktree:', e);
    }
  },

  setPRStatusBatch: (results) => {
    set((state) => {
      const nextByRepo = { ...state.prStatusByBranch };

      for (const result of results) {
        const existingRepoStatuses = nextByRepo[result.repo_path] ?? {};
        const nextRepoStatuses = { ...existingRepoStatuses };
        const refreshedStatuses = new Map(
          result.statuses.map((pr) => [pr.head_branch, pr])
        );

        for (const [branch, prStatus] of refreshedStatuses) {
          nextRepoStatuses[branch] = prStatus;
        }

        for (const branch of result.checked_branches) {
          if (!refreshedStatuses.has(branch)) {
            delete nextRepoStatuses[branch];
          }
        }

        nextByRepo[result.repo_path] = nextRepoStatuses;
      }

      return {
        prStatusByBranch: nextByRepo,
      };
    });
  },

  setPRDataCache: (repoPath: string, prNumber: number, data: { checksResult?: PRChecksResult | null; prDetails?: PRDetailedInfo | null }) => {
    const cacheKey = `${repoPath}:${prNumber}`;
    set((state) => {
      const existing = state.prDataCache[cacheKey] || { checksResult: null, prDetails: null, lastUpdated: 0 };
      return {
        prDataCache: {
          ...state.prDataCache,
          [cacheKey]: {
            checksResult: data.checksResult !== undefined ? data.checksResult : existing.checksResult,
            prDetails: data.prDetails !== undefined ? data.prDetails : existing.prDetails,
            lastUpdated: Date.now(),
          },
        },
      };
    });
  },

  getPRDataCache: (repoPath: string, prNumber: number) => {
    const cacheKey = `${repoPath}:${prNumber}`;
    const cached = get().prDataCache[cacheKey];
    if (!cached) return null;
    
    const CACHE_TTL_MS = 5 * 60 * 1000;
    if (Date.now() - cached.lastUpdated > CACHE_TTL_MS) return null;
    
    return cached;
  },

  clearPRDataCacheForRepo: (repoPath: string) => {
    set((state) => {
      const prefix = `${repoPath}:`;
      const newCache = Object.fromEntries(
        Object.entries(state.prDataCache).filter(([key]) => !key.startsWith(prefix))
      );
      return { prDataCache: newCache };
    });
  },

  checkGitHubCli: async () => {
    try {
      const available = await invoke<boolean>('check_gh_cli');
      let user: string | null = null;
      
      if (available) {
        try {
          user = await invoke<string>('check_gh_auth');
        } catch {
          user = null;
        }
      }
      
      set((state) => ({
        githubSettings: {
          ...state.githubSettings,
          ghCliAvailable: available,
          ghAuthUser: user,
        },
      }));
    } catch (e) {
      console.error('Failed to check GitHub CLI:', e);
      set((state) => ({
        githubSettings: {
          ...state.githubSettings,
          ghCliAvailable: false,
          ghAuthUser: null,
        },
      }));
    }
  },

  refreshProcessStatuses: async () => {
    const state = get();
    const worktreePaths = state.repositories.flatMap((repo) => repo.worktrees.map((wt) => wt.path));
    const now = Date.now();

    if (worktreePaths.length === 0) {
      set({ processStatusByPath: {}, agentRunByWorktreePath: {} });
      return;
    }

    try {
      const statuses = await invoke<Record<string, ProcessStatus>>('get_all_worktrees_process_status', {
        worktreePaths,
      });

      set((current) => {
        const nextProcessStatus: Record<string, ProcessStatus> = {};
        for (const path of worktreePaths) {
          nextProcessStatus[path] = statuses[path] ?? 'none';
        }

        const nextAgentRun: Record<string, AgentRunState | undefined> = {};
        for (const path of worktreePaths) {
          const reconciled = reconcileOneAgentRunState(
            path,
            nextProcessStatus[path],
            current.agentRunByWorktreePath[path],
            now
          );
          if (reconciled) {
            nextAgentRun[path] = reconciled;
          }
        }

        return {
          processStatusByPath: nextProcessStatus,
          agentRunByWorktreePath: nextAgentRun,
        };
      });
    } catch (e) {
      console.error('Failed to refresh process statuses:', e);
    }
  },

  getProcessStatus: (worktreePath: string): ProcessStatus => {
    return get().processStatusByPath[worktreePath] || 'none';
  },

  setAgentRunState: (event: AgentStatusEvent) => {
    set((state) => {
      const current = state.agentRunByWorktreePath[event.worktreePath];
      const isNewSession = !current || current.sessionId !== event.sessionId;
      const canStartSession = event.status === 'starting' || event.status === 'running' || event.status === 'waiting_input';

      if (!canStartSession && isNewSession) {
        return state;
      }

      const timestamp = event.timestamp || Date.now();
      const fromStatus = current?.status ?? 'idle';
      const normalizedAgent = isKnownAgent(event.agent) ? event.agent : current?.agent;
      const nextState: AgentRunState = {
        worktreePath: event.worktreePath,
        sessionId: event.sessionId,
        terminalId: event.terminalId ?? current?.terminalId,
        status: event.status,
        startedAt: isNewSession ? timestamp : (current?.startedAt ?? timestamp),
        lastEventAt: timestamp,
        agent: normalizedAgent,
        label: event.message,
        error: event.status === 'error' ? event.message ?? current?.error : undefined,
        endedAt: event.status === 'completed' || event.status === 'error' ? timestamp : undefined,
      };

      console.debug('[agent-status]', {
        worktreePath: event.worktreePath,
        sessionId: event.sessionId,
        from: fromStatus,
        to: nextState.status,
        reason: event.message ?? 'event',
      });

      return {
        agentRunByWorktreePath: {
          ...state.agentRunByWorktreePath,
          [event.worktreePath]: nextState,
        },
      };
    });
  },

  clearAgentRunState: (worktreePath: string) => {
    set((state) => {
      const { [worktreePath]: _, ...rest } = state.agentRunByWorktreePath;
      return { agentRunByWorktreePath: rest };
    });
  },

  markAgentRunError: (worktreePath: string, error: string) => {
    const now = Date.now();
    set((state) => {
      const current = state.agentRunByWorktreePath[worktreePath];
      const next: AgentRunState = current
        ? {
            ...current,
            status: 'error',
            error,
            label: error,
            lastEventAt: now,
            endedAt: now,
          }
        : {
            worktreePath,
            sessionId: `error-${worktreePath}-${now}`,
            status: 'error',
            startedAt: now,
            lastEventAt: now,
            endedAt: now,
            error,
            label: error,
          };

      return {
        agentRunByWorktreePath: {
          ...state.agentRunByWorktreePath,
          [worktreePath]: next,
        },
      };
    });
  },

  reconcileAgentRunWithProcessPolling: (worktreePath: string, processStatus: ProcessStatus) => {
    const now = Date.now();
    set((state) => {
      const current = state.agentRunByWorktreePath[worktreePath];
      const reconciled = reconcileOneAgentRunState(worktreePath, processStatus, current, now);
      if (reconciled === current) {
        return state;
      }

      if (!reconciled) {
        const { [worktreePath]: _, ...rest } = state.agentRunByWorktreePath;
        return { agentRunByWorktreePath: rest };
      }

      return {
        agentRunByWorktreePath: {
          ...state.agentRunByWorktreePath,
          [worktreePath]: reconciled,
        },
      };
    });
  },

  setDefaultAIAgent: async (agent: AIAgent) => {
    set({ defaultAIAgent: agent });
    try {
      const store = await load(STORE_PATH, { autoSave: true, defaults: {} });
      await store.set('defaultAIAgent', agent);
      await store.save();
    } catch (e) {
      console.error('Failed to save default AI agent:', e);
    }
  },

  updateWorktreeDiffStats: (stats) => {
    const statsMap = new Map(
      stats.map(s => [s.path, s.diff_stats ?? { additions: 0, deletions: 0 }])
    );
    set((state) => ({
      repositories: state.repositories.map((repo) => {
        const stableOrder = repo.worktrees.map((worktree) => worktree.path);
        const worktrees = repo.worktrees.map((wt) => {
          if (statsMap.has(wt.path)) {
            return { ...wt, diff_stats: statsMap.get(wt.path) };
          }
          return wt;
        });

        return {
          ...repo,
          worktrees: orderWorktrees(worktrees, state.worktreeOrdersByRepo[repo.info.path], stableOrder),
        };
      }),
    }));
  },

  toggleAddressedComment: (repoPath: string, prNumber: number, commentId: string) => {
    const cacheKey = `${repoPath}:${prNumber}`;
    set((state) => {
      const existing = state.addressedComments[cacheKey] || new Set<string>();
      const next = new Set(existing);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      const updated = {
        ...state.addressedComments,
        [cacheKey]: next,
      };
      saveAddressedComments(updated);
      return { addressedComments: updated };
    });
  },

  isCommentAddressed: (repoPath: string, prNumber: number, commentId: string) => {
    const cacheKey = `${repoPath}:${prNumber}`;
    return get().addressedComments[cacheKey]?.has(commentId) ?? false;
  },

  getAddressedCount: (repoPath: string, prNumber: number) => {
    const cacheKey = `${repoPath}:${prNumber}`;
    return get().addressedComments[cacheKey]?.size ?? 0;
  },

  clearAddressedComments: (repoPath: string, prNumber: number) => {
    const cacheKey = `${repoPath}:${prNumber}`;
    set((state) => {
      const { [cacheKey]: _, ...rest } = state.addressedComments;
      saveAddressedComments(rest);
      return { addressedComments: rest };
    });
  },
}));
