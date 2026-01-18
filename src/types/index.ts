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
