export interface RepoInfo {
  path: string;
  name: string;
}

export interface WorktreeInfo {
  name: string;
  path: string;
  branch: string | null;
  last_modified: string | null;
  diff_stats?: DiffStats;
}

export interface BranchInfo {
  name: string;
  is_remote: boolean;
  is_head: boolean;
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
  additions: number;
  deletions: number;
}

export interface Repository {
  info: RepoInfo;
  worktrees: WorktreeInfo[];
  isExpanded: boolean;
}

export type ProcessStatus = 'dev_server' | 'agent_running' | 'none';

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

export type AIAgent = 'opencode' | 'claude' | 'aider' | 'amp' | 'codex';

export const AI_AGENTS: { id: AIAgent; name: string; command: string }[] = [
  { id: 'opencode', name: 'OpenCode', command: 'opencode' },
  { id: 'claude', name: 'Claude CLI', command: 'claude' },
  { id: 'aider', name: 'Aider', command: 'aider' },
  { id: 'amp', name: 'Amp', command: 'amp' },
  { id: 'codex', name: 'Codex', command: 'codex' },
];
