import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { load } from '@tauri-apps/plugin-store';
import type { Repository, WorktreeInfo, TerminalInstance } from '../types';

interface PersistedState {
  repositoryPaths: string[];
}

interface WorktreeTerminals {
  terminals: TerminalInstance[];
  activeTerminalId: string | null;
}

interface AppStore {
  repositories: Repository[];
  selectedWorktree: WorktreeInfo | null;
  terminalsByWorktree: Record<string, WorktreeTerminals>;
  currentTerminals: TerminalInstance[];
  currentActiveTerminalId: string | null;
  isInitialized: boolean;

  initialize: () => Promise<void>;
  addRepository: (path: string) => Promise<void>;
  removeRepository: (path: string) => void;
  toggleRepoExpanded: (path: string) => void;
  refreshWorktrees: (repoPath: string) => Promise<void>;
  selectWorktree: (worktree: WorktreeInfo) => Promise<void>;

  addTerminal: () => Promise<string | null>;
  removeTerminal: (terminalId: string) => void;
  setActiveTerminal: (terminalId: string) => void;
}

const STORE_PATH = 'autopilot-settings.json';

async function loadPersistedState(): Promise<PersistedState> {
  try {
    const store = await load(STORE_PATH, { autoSave: true, defaults: {} });
    const paths = await store.get<string[]>('repositoryPaths');
    return { repositoryPaths: paths || [] };
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

  initialize: async () => {
    if (get().isInitialized) return;

    const persisted = await loadPersistedState();
    
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
}));
