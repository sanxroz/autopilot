export type PRReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;

export type ChecksStatus = 'success' | 'failure' | 'pending' | null;

export interface PRStatus {
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed' | 'merged';
  merged: boolean;
  draft: boolean;
  review_decision: PRReviewDecision;
  checks_status: ChecksStatus;
  mergeable: string | null;
  additions: number;
  deletions: number;
  head_branch: string;
  base_branch: string;
  author: string;
  created_at: string;
  updated_at: string;
  labels: string[];
  requested_reviewers: string[];
  has_unresolved_review_threads: boolean;
  is_bot: boolean;
}

export interface WorktreePRLookup {
  worktree_path: string;
  branch: string;
  head_oid: string | null;
}

export interface RepoWithWorktrees {
  repo_path: string;
  worktrees: WorktreePRLookup[];
}

export interface WorktreePRStatus {
  worktree_path: string;
  branch: string;
  status: PRStatus | null;
}

export interface RepoPathInput {
  repo_path: string;
}

export interface RepoPRStatuses {
  repo_path: string;
  statuses: PRStatus[];
  worktree_statuses: WorktreePRStatus[];
  checked_worktrees: string[];
  failed_worktrees: string[];
}

export interface GitHubSettings {
  ghCliAvailable: boolean;
  ghAuthUser: string | null;
  pollingIntervalMs: number;
}

export const DEFAULT_GITHUB_SETTINGS: GitHubSettings = {
  ghCliAvailable: false,
  ghAuthUser: null,
  pollingIntervalMs: 60000,
};
export interface PRCheck {
  name: string;
  bucket: string;
  state: string;
  description: string | null;
  workflow: string | null;
  event: string | null;
  url: string | null;
  started_at: string | null;
  completed_at: string | null;
  is_actions_job: boolean;
  job_id: number | null;
}

export interface PRChecksSummary {
  total: number;
  passing: number;
  failing: number;
  pending: number;
  skipped: number;
  cancelled: number;
}

export interface PRChecksResult {
  checks: PRCheck[];
  overall_status: string;
  summary: PRChecksSummary;
}

export interface PRCheckStep {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface PRCheckDetail {
  steps: PRCheckStep[];
  failed_log_excerpt: string | null;
}

export interface CreatePRResult {
  number: number;
  url: string;
}

export interface CubicReviewResult {
  success: boolean;
  output: string;
  error: string | null;
}

export interface PRComment {
  author: string;
  body: string;
  created_at: string;
  comment_type: 'issue' | 'review' | 'review_thread';
  state?: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | string;
  path?: string;
  line?: number;
  review_id?: string;
  thread_id?: string;
  is_resolved?: boolean;
}

export interface PRDetailedInfo {
  merge_state_status: string;
  mergeable: string;
  comments: PRComment[];
  review_decision: string | null;
  body: string | null;
}

export interface PRFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface PRCommit {
  oid: string;
  message_headline: string;
  committed_date: string;
  author_name: string;
}

export interface GithubNotification {
  id: string;
  reason: string;
  repo_name: string;
  subject_title: string;
  subject_type: string;
  subject_url: string | null;
  unread: boolean;
  updated_at: string;
}
