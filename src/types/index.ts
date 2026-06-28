export interface RepoInfo {
  readonly path: string;
  readonly name: string;
  readonly avatarUrl?: string;
}

export interface WorktreeInfo {
  readonly name: string;
  readonly path: string;
  readonly branch: string | null;
  readonly head_oid?: string | null;
  readonly last_modified: string | null;
  readonly diff_stats?: DiffStats;
}

export interface InstalledIde {
  readonly id: string;
  readonly name: string;
  readonly appPath?: string | null;
  readonly cliPath?: string | null;
  readonly iconPath?: string | null;
}

export interface BranchInfo {
  readonly name: string;
  readonly is_remote: boolean;
  readonly is_head: boolean;
}

export interface TerminalInstance {
  id: string;
  worktreePath: string;
  worktreeName: string;
}

export interface TerminalPane {
  id: string;
  terminals: TerminalInstance[];
  activeTerminalId: string | null;
}

export interface DiffStats {
  readonly additions: number;
  readonly deletions: number;
}

export interface Repository {
  readonly info: RepoInfo;
  readonly worktrees: readonly WorktreeInfo[];
  readonly isExpanded: boolean;
}

export interface AutoFetchSettings {
  readonly enabled: boolean;
  readonly intervalMinutes: number;
}

export interface WorktreeSetupResult {
  readonly success: boolean;
  readonly command: string;
  readonly output: string;
}

export type ProcessStatus = 'dev_server' | 'agent_running' | 'none';

export type AgentRunStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'waiting_input'
  | 'completed'
  | 'error';

export interface AgentRunState {
  worktreePath: string;
  sessionId: string;
  terminalId?: string;
  status: AgentRunStatus;
  startedAt: number;
  lastEventAt: number;
  endedAt?: number;
  agent?: AIAgent;
  label?: string;
  error?: string;
}

export interface AgentStatusEvent {
  worktreePath: string;
  sessionId: string;
  terminalId?: string;
  status: Exclude<AgentRunStatus, 'idle'>;
  timestamp: number;
  agent?: string;
  message?: string;
}

export type DiffViewMode = 'overlay' | 'sidebar';

export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked';

export interface ChangedFile {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
}

export interface FileDiffData {
  path: string;
  patch: string;
  old_content?: string | null;
  new_content?: string | null;
}

export interface GitStatusFile {
  path: string;
  status: string;
  staged: boolean;
}

export interface GitStatus {
  staged: GitStatusFile[];
  unstaged: GitStatusFile[];
  branch: string | null;
  upstream_branch: string | null;
  ahead: number;
  behind: number;
}

export type AIAgent = 'opencode' | 'claude' | 'droid' | 'amp' | 'codex';

export const AI_AGENTS: { id: AIAgent; name: string; command: string; promptFlag: string | null }[] = [
  { id: 'opencode', name: 'OpenCode', command: 'opencode', promptFlag: '--prompt' },
  { id: 'claude', name: 'Claude CLI', command: 'claude', promptFlag: '' },
  { id: 'droid', name: 'Droid', command: 'droid', promptFlag: '' },
  { id: 'amp', name: 'Amp', command: 'amp', promptFlag: null },
  { id: 'codex', name: 'Codex', command: 'codex', promptFlag: '' },
];
