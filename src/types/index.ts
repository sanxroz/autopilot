export interface RepoInfo {
  path: string;
  name: string;
}

export interface WorktreeInfo {
  name: string;
  path: string;
  branch: string | null;
  last_modified: string | null;
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

export interface Repository {
  info: RepoInfo;
  worktrees: WorktreeInfo[];
  isExpanded: boolean;
}
