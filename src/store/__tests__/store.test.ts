import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WorktreeInfo, AgentStatusEvent, ProcessStatus } from '../../types';

// ── Mocks ─────────────────────────────────────────────────────────
// vi.mock factories are hoisted — they cannot reference variables declared
// in the module scope. We use vi.hoisted() to declare shared mocks that
// both the factories and the tests can reference.

const { mockStoreInstance } = vi.hoisted(() => {
  const mockStoreInstance = {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
  };
  return { mockStoreInstance };
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn().mockResolvedValue(mockStoreInstance),
}));

vi.mock('../../theme', () => ({
  setThemeMode: vi.fn(),
  getThemeMode: vi.fn(() => 'dark'),
  toggleThemeMode: vi.fn(),
  subscribeTheme: vi.fn(),
  initializeTheme: vi.fn(),
  getTheme: vi.fn(),
}));

// Import after mocks
import { useAppStore } from '../index';
import { invoke } from '@tauri-apps/api/core';
import { load } from '@tauri-apps/plugin-store';
import { setThemeMode as setGlobalThemeMode, getThemeMode } from '../../theme';

import { mocked, waitFor } from '../../test/utils';
import { resetStore as resetAppStore } from '../../test/helpers/store-helpers';

const mockInvoke = mocked(invoke);
const mockLoad = mocked(load);

const makeWorktree = (overrides: Partial<WorktreeInfo> = {}): WorktreeInfo => ({
  name: 'feature-1',
  path: '/repos/project/.worktrees/feature-1',
  branch: 'feature-1',
  last_modified: '2026-01-01T00:00:00Z',
  ...overrides,
});

const makeRepo = (path = '/repos/project') => ({
  info: { path, name: 'project' },
  worktrees: [makeWorktree()],
  isExpanded: true,
});

// ── Tests ─────────────────────────────────────────────────────────

describe('AppStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAppStore();
    // Default mock for load
    mockLoad.mockResolvedValue(mockStoreInstance as any);
    mockStoreInstance.get.mockResolvedValue(undefined);
    mockStoreInstance.set.mockResolvedValue(undefined);
    mockStoreInstance.save.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Initial State ───────────────────────────────────────────────

  describe('initial state', () => {
    it('has correct default values', () => {
      const state = useAppStore.getState();
      expect(state.repositories).toEqual([]);
      expect(state.selectedWorktree).toBeNull();
      expect(state.currentTerminals).toEqual([]);
      expect(state.currentActiveTerminalId).toBeNull();
      expect(state.isInitialized).toBe(false);
      expect(state.settingsOpen).toBe(false);
      expect(state.codeReviewOpen).toBe(false);
      expect(state.diffOverlayOpen).toBe(false);
      expect(state.diffViewMode).toBe('overlay');
      expect(state.gitFileDiffPreview).toBeNull();
      expect(state.defaultAIAgent).toBe('opencode');
      expect(state.agentSidebarLifecycleEnabled).toBe(true);
      expect(state.githubSettings).toEqual({
        pollingIntervalMs: 30000,
        ghCliAvailable: false,
        ghAuthUser: null,
      });
      expect(state.collapsedRepos).toBeInstanceOf(Set);
      expect(state.collapsedRepos.size).toBe(0);
    });
  });

  // ── initialize ──────────────────────────────────────────────────

  describe('initialize', () => {
    it('loads persisted state and sets isInitialized', async () => {
      mockStoreInstance.get.mockImplementation(async (key: string) => {
        if (key === 'repositoryPaths') return ['/repos/project'];
        if (key === 'themeMode') return 'light';
        if (key === 'defaultAIAgent') return 'claude';
        return undefined;
      });
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'discover_repository') return { path: '/repos/project', name: 'project' };
        if (cmd === 'list_worktrees') return [makeWorktree()];
        if (cmd === 'check_gh_cli') return false;
        if (cmd === 'get_repo_from_remote') return null;
        return undefined;
      });

      await useAppStore.getState().initialize();

      const state = useAppStore.getState();
      expect(state.isInitialized).toBe(true);
      expect(state.repositories).toHaveLength(1);
      expect(state.repositories[0].info.path).toBe('/repos/project');
      expect(state.defaultAIAgent).toBe('claude');
      expect(setGlobalThemeMode).toHaveBeenCalledWith('light');
    });

    it('does not re-initialize if already initialized', async () => {
      useAppStore.setState({ isInitialized: true });
      await useAppStore.getState().initialize();
      expect(mockLoad).not.toHaveBeenCalled();
    });

    it('restores addressed comments from persisted state', async () => {
      mockStoreInstance.get.mockImplementation(async (key: string) => {
        if (key === 'repositoryPaths') return [];
        if (key === 'addressedComments') return { '/repo:42': ['c1', 'c2'] };
        return undefined;
      });
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'check_gh_cli') return false;
        return undefined;
      });

      await useAppStore.getState().initialize();

      const state = useAppStore.getState();
      const key = '/repo:42';
      expect(state.addressedComments[key]).toBeInstanceOf(Set);
      expect(state.addressedComments[key].size).toBe(2);
      expect(state.addressedComments[key].has('c1')).toBe(true);
    });

    it('handles loadPersistedState failure gracefully', async () => {
      mockLoad.mockRejectedValueOnce(new Error('disk error'));
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'check_gh_cli') return false;
        return undefined;
      });

      await useAppStore.getState().initialize();
      expect(useAppStore.getState().isInitialized).toBe(true);
      expect(useAppStore.getState().repositories).toEqual([]);
    });

    it('checks GitHub CLI during initialization', async () => {
      mockStoreInstance.get.mockResolvedValue(undefined);
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'check_gh_cli') return true;
        if (cmd === 'check_gh_auth') return 'testuser';
        return undefined;
      });

      await useAppStore.getState().initialize();

      // checkGitHubCli is called fire-and-forget, wait for it
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('check_gh_cli');
      });
    });
  });

  // ── addRepository ───────────────────────────────────────────────

  describe('addRepository', () => {
    it('adds a repository, deduplicates by path, and persists', async () => {
      mockStoreInstance.get.mockResolvedValue(undefined);
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'discover_repository') return { path: '/repos/myrepo', name: 'myrepo' };
        if (cmd === 'list_worktrees') return [makeWorktree({ path: '/repos/myrepo/.worktrees/main' })];
        if (cmd === 'get_repo_from_remote') return null;
        return undefined;
      });

      await useAppStore.getState().addRepository('/repos/myrepo');

      const state = useAppStore.getState();
      expect(state.repositories).toHaveLength(1);
      expect(state.repositories[0].info.name).toBe('myrepo');
      expect(state.repositories[0].isExpanded).toBe(true);
      // Persistence is fire-and-forget, wait for it
      await waitFor(() => {
        expect(mockStoreInstance.set).toHaveBeenCalledWith('repositoryPaths', ['/repos/myrepo']);
      });
    });

    it('replaces existing repo with same path', async () => {
      useAppStore.setState({
        repositories: [makeRepo('/repos/myrepo')],
      });

      mockStoreInstance.get.mockResolvedValue(undefined);
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'discover_repository') return { path: '/repos/myrepo', name: 'myrepo-updated' };
        if (cmd === 'list_worktrees') return [];
        if (cmd === 'get_repo_from_remote') return null;
        return undefined;
      });

      await useAppStore.getState().addRepository('/repos/myrepo');

      expect(useAppStore.getState().repositories).toHaveLength(1);
      expect(useAppStore.getState().repositories[0].info.name).toBe('myrepo-updated');
    });

    it('throws and propagates error on invoke failure', async () => {
      mockStoreInstance.get.mockResolvedValue(undefined);
      mockInvoke.mockRejectedValueOnce(new Error('not a git repo'));

      await expect(useAppStore.getState().addRepository('/bad/path')).rejects.toThrow('not a git repo');
    });
  });

  // ── removeRepository ────────────────────────────────────────────

  describe('removeRepository', () => {
    it('removes repository by path and persists', async () => {
      useAppStore.setState({ repositories: [makeRepo('/repos/project')] });

      useAppStore.getState().removeRepository('/repos/project');

      expect(useAppStore.getState().repositories).toEqual([]);
      // Persistence is async fire-and-forget
      await waitFor(() => {
        expect(mockStoreInstance.set).toHaveBeenCalledWith('repositoryPaths', []);
      });
    });

    it('leaves other repos unaffected', () => {
      useAppStore.setState({
        repositories: [makeRepo('/repos/a'), makeRepo('/repos/b')],
      });

      useAppStore.getState().removeRepository('/repos/a');

      expect(useAppStore.getState().repositories).toHaveLength(1);
      expect(useAppStore.getState().repositories[0].info.path).toBe('/repos/b');
    });
  });

  // ── toggleRepoExpanded ──────────────────────────────────────────

  describe('toggleRepoExpanded', () => {
    it('toggles isExpanded for the matching repo', () => {
      useAppStore.setState({ repositories: [makeRepo()] });

      useAppStore.getState().toggleRepoExpanded('/repos/project');
      expect(useAppStore.getState().repositories[0].isExpanded).toBe(false);

      useAppStore.getState().toggleRepoExpanded('/repos/project');
      expect(useAppStore.getState().repositories[0].isExpanded).toBe(true);
    });
  });

  // ── refreshWorktrees ────────────────────────────────────────────

  describe('refreshWorktrees', () => {
    it('fetches worktrees from backend and updates the repo', async () => {
      useAppStore.setState({ repositories: [makeRepo()] });
      const newWorktrees = [makeWorktree({ name: 'wt-new', path: '/repos/project/.worktrees/wt-new' })];
      mockInvoke.mockResolvedValueOnce(newWorktrees);

      await useAppStore.getState().refreshWorktrees('/repos/project');

      expect(mockInvoke).toHaveBeenCalledWith('list_worktrees', { repoPath: '/repos/project' });
      expect(useAppStore.getState().repositories[0].worktrees).toEqual(newWorktrees);
    });
  });

  // ── selectWorktree ──────────────────────────────────────────────

  describe('selectWorktree', () => {
    it('creates a new terminal when selecting a worktree with no existing terminals', async () => {
      const wt = makeWorktree();
      mockInvoke.mockResolvedValueOnce({ terminal_id: 'term-1' });

      await useAppStore.getState().selectWorktree(wt);

      expect(mockInvoke).toHaveBeenCalledWith('spawn_terminal', {
        cwd: wt.path,
        cols: 80,
        rows: 24,
        isDarkMode: true,
      });

      const state = useAppStore.getState();
      expect(state.selectedWorktree).toEqual(wt);
      expect(state.currentTerminals).toHaveLength(1);
      expect(state.currentTerminals[0].id).toBe('term-1');
      expect(state.currentActiveTerminalId).toBe('term-1');
      expect(state.gitFileDiffPreview).toBeNull();
    });

    it('restores existing terminals when selecting a worktree that has some', async () => {
      const wt = makeWorktree();
      const existingTerminal = { id: 'term-existing', worktreePath: wt.path, worktreeName: wt.name };
      useAppStore.setState({
        terminalsByWorktree: {
          [wt.path]: { terminals: [existingTerminal], activeTerminalId: 'term-existing' },
        },
      });

      await useAppStore.getState().selectWorktree(wt);

      expect(mockInvoke).not.toHaveBeenCalled();
      const state = useAppStore.getState();
      expect(state.currentTerminals).toEqual([existingTerminal]);
      expect(state.currentActiveTerminalId).toBe('term-existing');
    });

    it('does nothing if already on the same worktree', async () => {
      const wt = makeWorktree();
      useAppStore.setState({ selectedWorktree: wt });

      await useAppStore.getState().selectWorktree(wt);

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('uses getThemeMode to determine isDarkMode', async () => {
      const wt = makeWorktree();
      mocked(getThemeMode).mockReturnValueOnce('light');
      mockInvoke.mockResolvedValueOnce({ terminal_id: 'term-light' });

      await useAppStore.getState().selectWorktree(wt);

      expect(mockInvoke).toHaveBeenCalledWith('spawn_terminal', expect.objectContaining({
        isDarkMode: false,
      }));
    });
  });

  // ── addTerminal ─────────────────────────────────────────────────

  describe('addTerminal', () => {
    it('returns null if no worktree is selected', async () => {
      const result = await useAppStore.getState().addTerminal();
      expect(result).toBeNull();
    });

    it('adds a terminal and sets it as active', async () => {
      const wt = makeWorktree();
      useAppStore.setState({
        selectedWorktree: wt,
        currentTerminals: [],
        currentActiveTerminalId: null,
      });
      mockInvoke.mockResolvedValueOnce({ terminal_id: 'term-new' });

      const result = await useAppStore.getState().addTerminal();

      expect(result).toBe('term-new');
      const state = useAppStore.getState();
      expect(state.currentTerminals).toHaveLength(1);
      expect(state.currentActiveTerminalId).toBe('term-new');
      expect(state.terminalsByWorktree[wt.path].terminals).toHaveLength(1);
    });
  });

  // ── addTerminalWithCommand ──────────────────────────────────────

  describe('addTerminalWithCommand', () => {
    it('returns null if no worktree is selected', async () => {
      const result = await useAppStore.getState().addTerminalWithCommand('echo hi');
      expect(result).toBeNull();
    });

    it('spawns terminal with command and args', async () => {
      const wt = makeWorktree();
      useAppStore.setState({ selectedWorktree: wt, currentTerminals: [] });
      mockInvoke.mockResolvedValueOnce({ terminal_id: 'term-cmd' });

      const result = await useAppStore.getState().addTerminalWithCommand('npm test');

      expect(result).toBe('term-cmd');
      expect(mockInvoke).toHaveBeenCalledWith('spawn_terminal_with_command', {
        cwd: wt.path,
        command: 'npm test',
        args: [],
        cols: 80,
        rows: 24,
        isDarkMode: true,
      });
    });
  });

  // ── removeTerminal ──────────────────────────────────────────────

  describe('removeTerminal', () => {
    it('removes terminal and sets new active to last remaining', () => {
      const wt = makeWorktree();
      const terminals = [
        { id: 'term-1', worktreePath: wt.path, worktreeName: wt.name },
        { id: 'term-2', worktreePath: wt.path, worktreeName: wt.name },
      ];
      useAppStore.setState({
        selectedWorktree: wt,
        currentTerminals: terminals,
        currentActiveTerminalId: 'term-2',
        terminalsByWorktree: {
          [wt.path]: { terminals, activeTerminalId: 'term-2' },
        },
      });

      useAppStore.getState().removeTerminal('term-2');

      expect(mockInvoke).toHaveBeenCalledWith('close_terminal', { terminalId: 'term-2' });
      const state = useAppStore.getState();
      expect(state.currentTerminals).toHaveLength(1);
      expect(state.currentActiveTerminalId).toBe('term-1');
    });

    it('sets active to null when last terminal is removed', () => {
      const wt = makeWorktree();
      const terminals = [{ id: 'term-1', worktreePath: wt.path, worktreeName: wt.name }];
      useAppStore.setState({
        selectedWorktree: wt,
        currentTerminals: terminals,
        currentActiveTerminalId: 'term-1',
        terminalsByWorktree: {
          [wt.path]: { terminals, activeTerminalId: 'term-1' },
        },
      });

      useAppStore.getState().removeTerminal('term-1');

      expect(useAppStore.getState().currentActiveTerminalId).toBeNull();
      expect(useAppStore.getState().currentTerminals).toEqual([]);
    });

    it('does nothing if no worktree is selected', () => {
      useAppStore.getState().removeTerminal('term-1');
      // invoke is still called for close_terminal (fire-and-forget)
      expect(mockInvoke).toHaveBeenCalledWith('close_terminal', { terminalId: 'term-1' });
    });

    it('keeps active terminal if a different terminal is removed', () => {
      const wt = makeWorktree();
      const terminals = [
        { id: 'term-1', worktreePath: wt.path, worktreeName: wt.name },
        { id: 'term-2', worktreePath: wt.path, worktreeName: wt.name },
      ];
      useAppStore.setState({
        selectedWorktree: wt,
        currentTerminals: terminals,
        currentActiveTerminalId: 'term-1',
        terminalsByWorktree: {
          [wt.path]: { terminals, activeTerminalId: 'term-1' },
        },
      });

      useAppStore.getState().removeTerminal('term-2');

      expect(useAppStore.getState().currentActiveTerminalId).toBe('term-1');
    });
  });

  // ── setActiveTerminal ───────────────────────────────────────────

  describe('setActiveTerminal', () => {
    it('sets active terminal id', () => {
      const wt = makeWorktree();
      useAppStore.setState({
        selectedWorktree: wt,
        terminalsByWorktree: {
          [wt.path]: { terminals: [], activeTerminalId: null },
        },
      });

      useAppStore.getState().setActiveTerminal('term-99');

      expect(useAppStore.getState().currentActiveTerminalId).toBe('term-99');
      expect(useAppStore.getState().terminalsByWorktree[wt.path].activeTerminalId).toBe('term-99');
    });

    it('does nothing if no worktree selected', () => {
      useAppStore.getState().setActiveTerminal('term-99');
      expect(useAppStore.getState().currentActiveTerminalId).toBeNull();
    });
  });

  // ── toggleRepoCollapsed ─────────────────────────────────────────

  describe('toggleRepoCollapsed', () => {
    it('adds path to collapsedRepos Set when not present', () => {
      useAppStore.getState().toggleRepoCollapsed('/repos/a');
      expect(useAppStore.getState().collapsedRepos.has('/repos/a')).toBe(true);
    });

    it('removes path from collapsedRepos Set when already present', () => {
      useAppStore.setState({ collapsedRepos: new Set(['/repos/a']) });
      useAppStore.getState().toggleRepoCollapsed('/repos/a');
      expect(useAppStore.getState().collapsedRepos.has('/repos/a')).toBe(false);
    });

    it('creates a new Set instance (immutable update)', () => {
      const original = useAppStore.getState().collapsedRepos;
      useAppStore.getState().toggleRepoCollapsed('/repos/new');
      expect(useAppStore.getState().collapsedRepos).not.toBe(original);
    });
  });

  // ── setThemeMode ────────────────────────────────────────────────

  describe('setThemeMode', () => {
    it('calls global setThemeMode and persists to store', async () => {
      await useAppStore.getState().setThemeMode('light');

      expect(setGlobalThemeMode).toHaveBeenCalledWith('light');
      expect(mockStoreInstance.set).toHaveBeenCalledWith('themeMode', 'light');
      expect(mockStoreInstance.save).toHaveBeenCalled();
    });
  });

  // ── Toggle Actions ──────────────────────────────────────────────

  describe('toggle actions', () => {
    it('toggleSettings flips settingsOpen', () => {
      expect(useAppStore.getState().settingsOpen).toBe(false);
      useAppStore.getState().toggleSettings();
      expect(useAppStore.getState().settingsOpen).toBe(true);
      useAppStore.getState().toggleSettings();
      expect(useAppStore.getState().settingsOpen).toBe(false);
    });

    it('setCodeReviewOpen sets the value', () => {
      useAppStore.getState().setCodeReviewOpen(true);
      expect(useAppStore.getState().codeReviewOpen).toBe(true);
      useAppStore.getState().setCodeReviewOpen(false);
      expect(useAppStore.getState().codeReviewOpen).toBe(false);
    });

    it('toggleCodeReview flips codeReviewOpen', () => {
      useAppStore.getState().toggleCodeReview();
      expect(useAppStore.getState().codeReviewOpen).toBe(true);
      useAppStore.getState().toggleCodeReview();
      expect(useAppStore.getState().codeReviewOpen).toBe(false);
    });

    it('setDiffOverlayOpen sets the value', () => {
      useAppStore.getState().setDiffOverlayOpen(true);
      expect(useAppStore.getState().diffOverlayOpen).toBe(true);
    });

    it('toggleDiffOverlay flips diffOverlayOpen', () => {
      useAppStore.getState().toggleDiffOverlay();
      expect(useAppStore.getState().diffOverlayOpen).toBe(true);
      useAppStore.getState().toggleDiffOverlay();
      expect(useAppStore.getState().diffOverlayOpen).toBe(false);
    });

    it('setDiffViewMode sets the mode directly', () => {
      useAppStore.getState().setDiffViewMode('sidebar');
      expect(useAppStore.getState().diffViewMode).toBe('sidebar');
    });

    it('toggleDiffViewMode flips between overlay and sidebar', () => {
      expect(useAppStore.getState().diffViewMode).toBe('overlay');
      useAppStore.getState().toggleDiffViewMode();
      expect(useAppStore.getState().diffViewMode).toBe('sidebar');
      useAppStore.getState().toggleDiffViewMode();
      expect(useAppStore.getState().diffViewMode).toBe('overlay');
    });

    it('setGitFileDiffPreview sets and clears preview', () => {
      const preview = { filePath: 'foo.ts', worktreePath: '/repos/a', isStaged: false };
      useAppStore.getState().setGitFileDiffPreview(preview);
      expect(useAppStore.getState().gitFileDiffPreview).toEqual(preview);

      useAppStore.getState().setGitFileDiffPreview(null);
      expect(useAppStore.getState().gitFileDiffPreview).toBeNull();
    });
  });

  // ── createWorktreeAuto ──────────────────────────────────────────

  describe('createWorktreeAuto', () => {
    it('invokes backend and refreshes worktrees', async () => {
      const newWt = makeWorktree({ name: 'auto-wt' });
      useAppStore.setState({ repositories: [makeRepo()] });
      mockInvoke
        .mockResolvedValueOnce(newWt) // create_worktree_auto
        .mockResolvedValueOnce([makeWorktree(), newWt]); // list_worktrees (refresh)

      const result = await useAppStore.getState().createWorktreeAuto('/repos/project');

      expect(result).toEqual(newWt);
      expect(mockInvoke).toHaveBeenCalledWith('create_worktree_auto', { repoPath: '/repos/project' });
      expect(useAppStore.getState().repositories[0].worktrees).toHaveLength(2);
    });

    it('throws on failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('branch conflict'));
      await expect(useAppStore.getState().createWorktreeAuto('/repos/project')).rejects.toThrow('branch conflict');
    });
  });

  // ── deleteWorktree ──────────────────────────────────────────────

  describe('deleteWorktree', () => {
    it('closes terminals, deletes worktree, and refreshes', async () => {
      useAppStore.setState({ repositories: [makeRepo()] });
      mockInvoke
        .mockResolvedValueOnce(2) // close_terminals_for_worktree
        .mockResolvedValueOnce(undefined) // delete_worktree
        .mockResolvedValueOnce([]); // list_worktrees (refresh)

      await useAppStore.getState().deleteWorktree('/repos/project', 'feature-1');

      expect(mockInvoke).toHaveBeenCalledWith('close_terminals_for_worktree', {
        worktreePath: '/repos/project/.worktrees/feature-1',
      });
      expect(mockInvoke).toHaveBeenCalledWith('delete_worktree', {
        repoPath: '/repos/project',
        worktreeName: 'feature-1',
        force: true,
      });
    });
  });

  // ── PR Status ───────────────────────────────────────────────────

  describe('PR status management', () => {
    it('setPRStatusBatch merges normalized batch into prStatusByBranch', () => {
      useAppStore.setState({
        prStatusByBranch: { '/repo-a': { 'main': { number: 1 } as any } },
      });

      useAppStore.getState().setPRStatusBatch({
        '/repo-b': { 'feat': { number: 2 } as any },
      });

      const state = useAppStore.getState();
      expect(state.prStatusByBranch['/repo-a']).toBeDefined();
      expect(state.prStatusByBranch['/repo-b']).toBeDefined();
    });

    it('setPRStatusBatch accepts legacy repo status results', () => {
      useAppStore.setState({
        prStatusByBranch: { '/repo-a': { 'main': { number: 1 } as any } },
      });

      useAppStore.getState().setPRStatusBatch([
        {
          repo_path: '/repo-b',
          statuses: [{ number: 2, head_branch: 'feat' } as any],
        },
      ]);

      const state = useAppStore.getState();
      expect(state.prStatusByBranch['/repo-a']).toBeDefined();
      expect(state.prStatusByBranch['/repo-b']?.feat?.number).toBe(2);
    });
  });

  // ── PR Data Cache ───────────────────────────────────────────────

  describe('PR data cache', () => {
    it('setPRDataCache stores data with timestamp', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      useAppStore.getState().setPRDataCache('/repo', 42, {
        checksResult: { checks: [], overall_status: 'success' },
      });

      const cached = useAppStore.getState().prDataCache['/repo:42'];
      expect(cached).toBeDefined();
      expect(cached.checksResult?.overall_status).toBe('success');
      expect(cached.prDetails).toBeNull();
      expect(cached.lastUpdated).toBe(now);
    });

    it('setPRDataCache merges with existing data', () => {
      useAppStore.setState({
        prDataCache: {
          '/repo:42': { checksResult: { checks: [], overall_status: 'pending' }, prDetails: null, lastUpdated: 100 },
        },
      });

      useAppStore.getState().setPRDataCache('/repo', 42, {
        prDetails: { merge_state_status: 'clean', mergeable: 'MERGEABLE', comments: [], review_decision: null },
      });

      const cached = useAppStore.getState().prDataCache['/repo:42'];
      expect(cached.checksResult?.overall_status).toBe('pending'); // preserved
      expect(cached.prDetails?.mergeable).toBe('MERGEABLE'); // added
    });

    it('getPRDataCache returns null for missing entries', () => {
      expect(useAppStore.getState().getPRDataCache('/repo', 99)).toBeNull();
    });

    it('getPRDataCache returns null for expired entries (>5min)', () => {
      const fiveMinAgo = Date.now() - (5 * 60 * 1000 + 1);
      useAppStore.setState({
        prDataCache: {
          '/repo:42': { checksResult: null, prDetails: null, lastUpdated: fiveMinAgo },
        },
      });

      expect(useAppStore.getState().getPRDataCache('/repo', 42)).toBeNull();
    });

    it('getPRDataCache returns cached data if within TTL', () => {
      const recent = Date.now() - 1000;
      useAppStore.setState({
        prDataCache: {
          '/repo:42': { checksResult: null, prDetails: null, lastUpdated: recent },
        },
      });

      expect(useAppStore.getState().getPRDataCache('/repo', 42)).not.toBeNull();
    });

    it('clearPRDataCacheForRepo removes entries for a specific repo', () => {
      useAppStore.setState({
        prDataCache: {
          '/repo-a:1': { checksResult: null, prDetails: null, lastUpdated: 100 },
          '/repo-a:2': { checksResult: null, prDetails: null, lastUpdated: 100 },
          '/repo-b:3': { checksResult: null, prDetails: null, lastUpdated: 100 },
        },
      });

      useAppStore.getState().clearPRDataCacheForRepo('/repo-a');

      const cache = useAppStore.getState().prDataCache;
      expect(cache['/repo-a:1']).toBeUndefined();
      expect(cache['/repo-a:2']).toBeUndefined();
      expect(cache['/repo-b:3']).toBeDefined();
    });
  });

  // ── setPollingInterval ──────────────────────────────────────────

  describe('setPollingInterval', () => {
    it('updates githubSettings.pollingIntervalMs', () => {
      useAppStore.getState().setPollingInterval(15000);
      expect(useAppStore.getState().githubSettings.pollingIntervalMs).toBe(15000);
    });
  });

  // ── checkGitHubCli ──────────────────────────────────────────────

  describe('checkGitHubCli', () => {
    it('sets ghCliAvailable and ghAuthUser when CLI is available', async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'check_gh_cli') return true;
        if (cmd === 'check_gh_auth') return 'octocat';
        return undefined;
      });

      await useAppStore.getState().checkGitHubCli();

      const { githubSettings } = useAppStore.getState();
      expect(githubSettings.ghCliAvailable).toBe(true);
      expect(githubSettings.ghAuthUser).toBe('octocat');
    });

    it('sets false/null when CLI is not available', async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'check_gh_cli') return false;
        return undefined;
      });

      await useAppStore.getState().checkGitHubCli();

      const { githubSettings } = useAppStore.getState();
      expect(githubSettings.ghCliAvailable).toBe(false);
      expect(githubSettings.ghAuthUser).toBeNull();
    });

    it('handles check_gh_auth failure gracefully', async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'check_gh_cli') return true;
        if (cmd === 'check_gh_auth') throw new Error('not logged in');
        return undefined;
      });

      await useAppStore.getState().checkGitHubCli();

      const { githubSettings } = useAppStore.getState();
      expect(githubSettings.ghCliAvailable).toBe(true);
      expect(githubSettings.ghAuthUser).toBeNull();
    });

    it('handles complete failure gracefully', async () => {
      mockInvoke.mockRejectedValue(new Error('binary not found'));

      await useAppStore.getState().checkGitHubCli();

      const { githubSettings } = useAppStore.getState();
      expect(githubSettings.ghCliAvailable).toBe(false);
      expect(githubSettings.ghAuthUser).toBeNull();
    });
  });

  // ── getProcessStatus ────────────────────────────────────────────

  describe('getProcessStatus', () => {
    it('returns "none" for unknown paths', () => {
      expect(useAppStore.getState().getProcessStatus('/unknown')).toBe('none');
    });

    it('returns the stored status for known paths', () => {
      useAppStore.setState({
        processStatusByPath: { '/repos/a': 'agent_running' },
      });
      expect(useAppStore.getState().getProcessStatus('/repos/a')).toBe('agent_running');
    });
  });

  // ── Agent Run State ─────────────────────────────────────────────

  describe('setAgentRunState', () => {
    it('creates new agent run for starting event', () => {
      const event: AgentStatusEvent = {
        worktreePath: '/repos/a',
        sessionId: 'sess-1',
        status: 'starting',
        timestamp: 1000,
        agent: 'claude',
        message: 'Starting...',
      };

      useAppStore.getState().setAgentRunState(event);

      const agentRun = useAppStore.getState().agentRunByWorktreePath['/repos/a'];
      expect(agentRun).toBeDefined();
      expect(agentRun!.status).toBe('starting');
      expect(agentRun!.sessionId).toBe('sess-1');
      expect(agentRun!.agent).toBe('claude');
      expect(agentRun!.startedAt).toBe(1000);
    });

    it('ignores non-starting events for unknown sessions', () => {
      const event: AgentStatusEvent = {
        worktreePath: '/repos/a',
        sessionId: 'sess-unknown',
        status: 'completed',
        timestamp: 2000,
      };

      useAppStore.getState().setAgentRunState(event);

      expect(useAppStore.getState().agentRunByWorktreePath['/repos/a']).toBeUndefined();
    });

    it('transitions from starting to running for same session', () => {
      const startEvent: AgentStatusEvent = {
        worktreePath: '/repos/a',
        sessionId: 'sess-1',
        status: 'starting',
        timestamp: 1000,
        agent: 'claude',
      };
      useAppStore.getState().setAgentRunState(startEvent);

      const runEvent: AgentStatusEvent = {
        worktreePath: '/repos/a',
        sessionId: 'sess-1',
        status: 'running',
        timestamp: 2000,
      };
      useAppStore.getState().setAgentRunState(runEvent);

      const agentRun = useAppStore.getState().agentRunByWorktreePath['/repos/a'];
      expect(agentRun!.status).toBe('running');
      expect(agentRun!.startedAt).toBe(1000); // preserved
      expect(agentRun!.lastEventAt).toBe(2000);
      expect(agentRun!.agent).toBe('claude'); // preserved from current state
    });

    it('sets endedAt for completed status', () => {
      const startEvent: AgentStatusEvent = {
        worktreePath: '/repos/a',
        sessionId: 'sess-1',
        status: 'running',
        timestamp: 1000,
        agent: 'opencode',
      };
      useAppStore.getState().setAgentRunState(startEvent);

      const completeEvent: AgentStatusEvent = {
        worktreePath: '/repos/a',
        sessionId: 'sess-1',
        status: 'completed',
        timestamp: 5000,
        message: 'Done!',
      };
      useAppStore.getState().setAgentRunState(completeEvent);

      const agentRun = useAppStore.getState().agentRunByWorktreePath['/repos/a'];
      expect(agentRun!.status).toBe('completed');
      expect(agentRun!.endedAt).toBe(5000);
    });

    it('sets error info for error status', () => {
      useAppStore.getState().setAgentRunState({
        worktreePath: '/repos/a',
        sessionId: 'sess-1',
        status: 'starting',
        timestamp: 1000,
        agent: 'claude',
      });

      useAppStore.getState().setAgentRunState({
        worktreePath: '/repos/a',
        sessionId: 'sess-1',
        status: 'error',
        timestamp: 2000,
        message: 'Crashed!',
      });

      const agentRun = useAppStore.getState().agentRunByWorktreePath['/repos/a'];
      expect(agentRun!.status).toBe('error');
      expect(agentRun!.error).toBe('Crashed!');
      expect(agentRun!.endedAt).toBe(2000);
    });

    it('normalizes unknown agent to current agent', () => {
      useAppStore.getState().setAgentRunState({
        worktreePath: '/repos/a',
        sessionId: 'sess-1',
        status: 'starting',
        timestamp: 1000,
        agent: 'claude',
      });

      useAppStore.getState().setAgentRunState({
        worktreePath: '/repos/a',
        sessionId: 'sess-1',
        status: 'running',
        timestamp: 2000,
        agent: 'unknown-agent',
      });

      // unknown agent normalizes to current agent
      expect(useAppStore.getState().agentRunByWorktreePath['/repos/a']!.agent).toBe('claude');
    });

    it('allows new session to start with running status', () => {
      useAppStore.getState().setAgentRunState({
        worktreePath: '/repos/a',
        sessionId: 'sess-new',
        status: 'running',
        timestamp: 1000,
        agent: 'amp',
      });

      expect(useAppStore.getState().agentRunByWorktreePath['/repos/a']!.sessionId).toBe('sess-new');
      expect(useAppStore.getState().agentRunByWorktreePath['/repos/a']!.status).toBe('running');
    });
  });

  // ── clearAgentRunState ──────────────────────────────────────────

  describe('clearAgentRunState', () => {
    it('removes agent run state for the given path', () => {
      useAppStore.setState({
        agentRunByWorktreePath: {
          '/repos/a': {
            worktreePath: '/repos/a',
            sessionId: 's1',
            status: 'running',
            startedAt: 1000,
            lastEventAt: 1000,
          },
          '/repos/b': {
            worktreePath: '/repos/b',
            sessionId: 's2',
            status: 'running',
            startedAt: 2000,
            lastEventAt: 2000,
          },
        },
      });

      useAppStore.getState().clearAgentRunState('/repos/a');

      expect(useAppStore.getState().agentRunByWorktreePath['/repos/a']).toBeUndefined();
      expect(useAppStore.getState().agentRunByWorktreePath['/repos/b']).toBeDefined();
    });
  });

  // ── markAgentRunError ───────────────────────────────────────────

  describe('markAgentRunError', () => {
    it('creates error state when no existing state', () => {
      useAppStore.getState().markAgentRunError('/repos/a', 'timeout');

      const state = useAppStore.getState().agentRunByWorktreePath['/repos/a'];
      expect(state).toBeDefined();
      expect(state!.status).toBe('error');
      expect(state!.error).toBe('timeout');
      expect(state!.label).toBe('timeout');
      expect(state!.sessionId).toMatch(/^error-\/repos\/a-/);
    });

    it('marks existing running state as error', () => {
      useAppStore.setState({
        agentRunByWorktreePath: {
          '/repos/a': {
            worktreePath: '/repos/a',
            sessionId: 'sess-1',
            status: 'running',
            startedAt: 1000,
            lastEventAt: 1000,
            agent: 'claude',
          },
        },
      });

      useAppStore.getState().markAgentRunError('/repos/a', 'OOM');

      const state = useAppStore.getState().agentRunByWorktreePath['/repos/a'];
      expect(state!.status).toBe('error');
      expect(state!.error).toBe('OOM');
      expect(state!.sessionId).toBe('sess-1'); // preserved
      expect(state!.agent).toBe('claude'); // preserved
    });
  });

  // ── reconcileAgentRunWithProcessPolling ──────────────────────────

  describe('reconcileAgentRunWithProcessPolling', () => {
    it('marks active agent as completed when process is gone', () => {
      useAppStore.setState({
        agentRunByWorktreePath: {
          '/repos/a': {
            worktreePath: '/repos/a',
            sessionId: 's1',
            status: 'running',
            startedAt: 1000,
            lastEventAt: 1000,
          },
        },
      });

      useAppStore.getState().reconcileAgentRunWithProcessPolling('/repos/a', 'none');

      const state = useAppStore.getState().agentRunByWorktreePath['/repos/a'];
      expect(state!.status).toBe('completed');
      expect(state!.label).toBe('Agent process exited');
    });

    it('does not create state from agent_running process when no existing state', () => {
      useAppStore.getState().reconcileAgentRunWithProcessPolling('/repos/a', 'agent_running');
      expect(useAppStore.getState().agentRunByWorktreePath['/repos/a']).toBeUndefined();
    });

    it('removes completed state after TTL expires', () => {
      const oldTime = Date.now() - 10000; // 10s ago, well past 5s TTL
      useAppStore.setState({
        agentRunByWorktreePath: {
          '/repos/a': {
            worktreePath: '/repos/a',
            sessionId: 's1',
            status: 'completed',
            startedAt: oldTime - 5000,
            lastEventAt: oldTime,
            endedAt: oldTime,
          },
        },
      });

      useAppStore.getState().reconcileAgentRunWithProcessPolling('/repos/a', 'none');

      expect(useAppStore.getState().agentRunByWorktreePath['/repos/a']).toBeUndefined();
    });

    it('keeps agent_running state when process is still running', () => {
      useAppStore.setState({
        agentRunByWorktreePath: {
          '/repos/a': {
            worktreePath: '/repos/a',
            sessionId: 's1',
            status: 'running',
            startedAt: 1000,
            lastEventAt: 1000,
          },
        },
      });

      useAppStore.getState().reconcileAgentRunWithProcessPolling('/repos/a', 'agent_running');

      const state = useAppStore.getState().agentRunByWorktreePath['/repos/a'];
      expect(state!.status).toBe('running'); // unchanged
    });
  });

  // ── refreshProcessStatuses ──────────────────────────────────────

  describe('refreshProcessStatuses', () => {
    it('clears all statuses when no worktrees exist', async () => {
      useAppStore.setState({
        repositories: [],
        processStatusByPath: { '/old': 'agent_running' },
        agentRunByWorktreePath: { '/old': { worktreePath: '/old', sessionId: 's', status: 'running', startedAt: 0, lastEventAt: 0 } },
      });

      await useAppStore.getState().refreshProcessStatuses();

      expect(useAppStore.getState().processStatusByPath).toEqual({});
      expect(useAppStore.getState().agentRunByWorktreePath).toEqual({});
    });

    it('fetches and reconciles process statuses', async () => {
      const wt = makeWorktree();
      useAppStore.setState({ repositories: [makeRepo()] });

      mockInvoke.mockResolvedValueOnce({
        [wt.path]: 'dev_server',
      });

      await useAppStore.getState().refreshProcessStatuses();

      expect(mockInvoke).toHaveBeenCalledWith('get_all_worktrees_process_status', {
        worktreePaths: [wt.path],
      });
      expect(useAppStore.getState().processStatusByPath[wt.path]).toBe('dev_server');
    });
  });

  // ── setDefaultAIAgent ───────────────────────────────────────────

  describe('setDefaultAIAgent', () => {
    it('updates state and persists to store', async () => {
      await useAppStore.getState().setDefaultAIAgent('claude');

      expect(useAppStore.getState().defaultAIAgent).toBe('claude');
      expect(mockStoreInstance.set).toHaveBeenCalledWith('defaultAIAgent', 'claude');
      expect(mockStoreInstance.save).toHaveBeenCalled();
    });
  });

  // ── updateWorktreeDiffStats ─────────────────────────────────────

  describe('updateWorktreeDiffStats', () => {
    it('updates diff_stats for matching worktrees', () => {
      useAppStore.setState({ repositories: [makeRepo()] });
      const wtPath = '/repos/project/.worktrees/feature-1';

      useAppStore.getState().updateWorktreeDiffStats([
        { path: wtPath, diff_stats: { additions: 10, deletions: 5 } },
      ]);

      const wt = useAppStore.getState().repositories[0].worktrees[0];
      expect(wt.diff_stats).toEqual({ additions: 10, deletions: 5 });
    });

    it('sets diff_stats to undefined when null', () => {
      const wtPath = '/repos/project/.worktrees/feature-1';
      useAppStore.setState({
        repositories: [{
          ...makeRepo(),
          worktrees: [makeWorktree({ diff_stats: { additions: 10, deletions: 5 } })],
        }],
      });

      useAppStore.getState().updateWorktreeDiffStats([
        { path: wtPath, diff_stats: null },
      ]);

      const wt = useAppStore.getState().repositories[0].worktrees[0];
      expect(wt.diff_stats).toBeUndefined();
    });

    it('leaves non-matching worktrees unchanged', () => {
      useAppStore.setState({ repositories: [makeRepo()] });

      useAppStore.getState().updateWorktreeDiffStats([
        { path: '/repos/other/wt', diff_stats: { additions: 99, deletions: 99 } },
      ]);

      const wt = useAppStore.getState().repositories[0].worktrees[0];
      expect(wt.diff_stats).toBeUndefined();
    });
  });

  // ── Addressed Comments ──────────────────────────────────────────

  describe('addressed comments', () => {
    const repoPath = '/repos/project';
    const prNumber = 42;

    it('toggleAddressedComment adds a comment', () => {
      useAppStore.getState().toggleAddressedComment(repoPath, prNumber, 'c1');

      expect(useAppStore.getState().isCommentAddressed(repoPath, prNumber, 'c1')).toBe(true);
      expect(useAppStore.getState().getAddressedCount(repoPath, prNumber)).toBe(1);
    });

    it('toggleAddressedComment removes a comment when already addressed', () => {
      useAppStore.getState().toggleAddressedComment(repoPath, prNumber, 'c1');
      useAppStore.getState().toggleAddressedComment(repoPath, prNumber, 'c1');

      expect(useAppStore.getState().isCommentAddressed(repoPath, prNumber, 'c1')).toBe(false);
      expect(useAppStore.getState().getAddressedCount(repoPath, prNumber)).toBe(0);
    });

    it('isCommentAddressed returns false for unknown comments', () => {
      expect(useAppStore.getState().isCommentAddressed(repoPath, prNumber, 'unknown')).toBe(false);
    });

    it('getAddressedCount returns 0 for unknown keys', () => {
      expect(useAppStore.getState().getAddressedCount('/unknown', 999)).toBe(0);
    });

    it('clearAddressedComments removes all for a repo/PR', () => {
      useAppStore.getState().toggleAddressedComment(repoPath, prNumber, 'c1');
      useAppStore.getState().toggleAddressedComment(repoPath, prNumber, 'c2');
      useAppStore.getState().toggleAddressedComment(repoPath, 99, 'c3');

      useAppStore.getState().clearAddressedComments(repoPath, prNumber);

      expect(useAppStore.getState().getAddressedCount(repoPath, prNumber)).toBe(0);
      // Other PR's comments are untouched
      expect(useAppStore.getState().getAddressedCount(repoPath, 99)).toBe(1);
    });

    it('toggleAddressedComment persists via saveAddressedComments', async () => {
      useAppStore.getState().toggleAddressedComment(repoPath, prNumber, 'c1');

      // saveAddressedComments is async fire-and-forget
      await waitFor(() => {
        expect(mockStoreInstance.set).toHaveBeenCalledWith(
          'addressedComments',
          expect.objectContaining({ [`${repoPath}:${prNumber}`]: ['c1'] }),
        );
      });
    });
  });

  // ── updateWorktreeBranch ────────────────────────────────────────

  describe('updateWorktreeBranch', () => {
    it('updates branch name for matching worktree', async () => {
      const wt = makeWorktree({ branch: 'old-branch' });
      useAppStore.setState({
        repositories: [{ info: { path: '/repos/project', name: 'project' }, worktrees: [wt], isExpanded: true }],
        selectedWorktree: wt,
      });
      mockInvoke.mockResolvedValueOnce('new-branch');

      await useAppStore.getState().updateWorktreeBranch(wt.path);

      expect(mockInvoke).toHaveBeenCalledWith('get_worktree_branch_name', { worktreePath: wt.path });
      expect(useAppStore.getState().repositories[0].worktrees[0].branch).toBe('new-branch');
      expect(useAppStore.getState().selectedWorktree!.branch).toBe('new-branch');
    });
  });
});
