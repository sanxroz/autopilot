import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { load } from '@tauri-apps/plugin-store';
import type { Repository, WorktreeInfo, TerminalInstance, ProcessStatus, DiffViewMode, AIAgent } from '../types';
import type { GitHubSettings, PRStatus, PRChecksResult, PRDetailedInfo } from '../types/github';
import { DEFAULT_GITHUB_SETTINGS } from '../types/github';
import { setThemeMode as setGlobalThemeMode, getThemeMode, type ThemeMode } from '../theme';

interface PersistedState {
  repositoryPaths: string[];
  defaultAIAgent?: AIAgent;
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
  collapsedRepos: Set<string>;
  settingsOpen: boolean;
  codeReviewOpen: boolean;
  diffOverlayOpen: boolean;
  diffViewMode: DiffViewMode;
  processStatusByPath: Record<string, ProcessStatus>;
  defaultAIAgent: AIAgent;

  initialize: () => Promise<void>;
  addRepository: (path: string) => Promise<void>;
  removeRepository: (path: string) => void;
  toggleRepoExpanded: (path: string) => void;
  refreshWorktrees: (repoPath: string) => Promise<void>;
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
  setDiffOverlayOpen: (open: boolean) => void;
  toggleDiffOverlay: () => void;
  setDiffViewMode: (mode: DiffViewMode) => void;
  toggleDiffViewMode: () => void;
  createWorktreeAuto: (repoPath: string) => Promise<WorktreeInfo | null>;
  deleteWorktree: (repoPath: string, worktreeName: string) => Promise<void>;
  setPRStatusBatch: (batch: Record<string, Record<string, PRStatus>>) => void;
  setPRDataCache: (repoPath: string, prNumber: number, data: { checksResult?: PRChecksResult | null; prDetails?: PRDetailedInfo | null }) => void;
  getPRDataCache: (repoPath: string, prNumber: number) => PRDataCache | null;
  clearPRDataCacheForRepo: (repoPath: string) => void;
  setPollingInterval: (intervalMs: number) => void;
  checkGitHubCli: () => Promise<void>;
  refreshProcessStatuses: () => Promise<void>;
  getProcessStatus: (worktreePath: string) => ProcessStatus;
  setDefaultAIAgent: (agent: AIAgent) => Promise<void>;
}

const STORE_PATH = 'autopilot-settings.json';

async function loadPersistedState(): Promise<PersistedState & { themeMode?: ThemeMode }> {
  try {
    const store = await load(STORE_PATH, { autoSave: true, defaults: {} });
    const paths = await store.get<string[]>('repositoryPaths');
    const themeMode = await store.get<ThemeMode>('themeMode');
    const defaultAIAgent = await store.get<AIAgent>('defaultAIAgent');
    return { repositoryPaths: paths || [], themeMode, defaultAIAgent };
  } catch {
    return { repositoryPaths: [] };
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
  collapsedRepos: new Set<string>(),
  settingsOpen: false,
  codeReviewOpen: false,
  diffOverlayOpen: false,
  diffViewMode: 'overlay',
  processStatusByPath: {},
  defaultAIAgent: 'opencode',

  initialize: async () => {
    if (get().isInitialized) return;

    const persisted = await loadPersistedState();
    
    if (persisted.themeMode) {
      setGlobalThemeMode(persisted.themeMode);
    }

    if (persisted.defaultAIAgent) {
      set({ defaultAIAgent: persisted.defaultAIAgent });
    }
    
    for (const path of persisted.repositoryPaths) {
      try {
        const info = await invoke<{ path: string; name: string }>('discover_repository', { path });
        const worktrees = await invoke<WorktreeInfo[]>('list_worktrees', { repoPath: info.path });

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
    
    get().checkGitHubCli();
  },

  addRepository: async (path: string) => {
    try {
      const info = await invoke<{ path: string; name: string }>('discover_repository', { path });
      const worktrees = await invoke<WorktreeInfo[]>('list_worktrees', { repoPath: info.path });

      set((state) => {
        const newRepos = [
          ...state.repositories.filter((r) => r.info.path !== info.path),
          { info, worktrees, isExpanded: true },
        ];
        
        savePersistedState({ repositoryPaths: newRepos.map((r) => r.info.path) });
        
        return { repositories: newRepos };
      });
    } catch (e) {
      console.error('Failed to add repository:', e);
      throw e;
    }
  },

  removeRepository: (path: string) => {
    set((state) => {
      const newRepos = state.repositories.filter((r) => r.info.path !== path);
      savePersistedState({ repositoryPaths: newRepos.map((r) => r.info.path) });
      return { repositories: newRepos };
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
    const worktrees = await invoke<WorktreeInfo[]>('list_worktrees', { repoPath });
    set((state) => ({
      repositories: state.repositories.map((r) =>
        r.info.path === repoPath ? { ...r, worktrees } : r
      ),
    }));
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

    // Use spawn_terminal_with_command to avoid race condition
    // The command is executed as part of shell initialization, eliminating
    // the timing issue with writing to a terminal before the shell is ready
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

  setDiffOverlayOpen: (open: boolean) => {
    set({ diffOverlayOpen: open });
  },

  toggleDiffOverlay: () => {
    set((state) => ({ diffOverlayOpen: !state.diffOverlayOpen }));
  },

  setDiffViewMode: (mode: DiffViewMode) => {
    set({ diffViewMode: mode });
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
    try {
      await invoke('delete_worktree', { repoPath, worktreeName, force: true });
      await get().refreshWorktrees(repoPath);
    } catch (e) {
      console.error('Failed to delete worktree:', e);
      throw e;
    }
  },

  setPRStatusBatch: (batch: Record<string, Record<string, PRStatus>>) => {
    set({ prStatusByBranch: batch });
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

  setPollingInterval: (intervalMs: number) => {
    set((state) => ({
      githubSettings: { ...state.githubSettings, pollingIntervalMs: intervalMs },
    }));
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

  refreshProcessStatuses: async () => {},

  getProcessStatus: (worktreePath: string): ProcessStatus => {
    return get().processStatusByPath[worktreePath] || 'none';
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
}));
