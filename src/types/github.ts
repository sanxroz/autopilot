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
  additions: number;
  deletions: number;
  head_branch: string;
  base_branch: string;
  author: string;
  created_at: string;
  updated_at: string;
  labels: string[];
  requested_reviewers: string[];
  is_bot: boolean;
}

export interface RepoWithBranches {
  repo_path: string;
  branches: string[];
}

export interface RepoPathInput {
  repo_path: string;
}

export interface RepoPRStatuses {
  repo_path: string;
  statuses: PRStatus[];
  checked_branches: string[];
  failed_branches: string[];
}

export interface PRHubFilters {
  scope: 'mine' | 'all';
  status: 'all' | 'open' | 'draft' | 'ready';
  review: 'all' | 'needs_review' | 'approved' | 'changes_requested';
  repo: string;
  authorType: 'all' | 'human' | 'bot';
}

export const DEFAULT_PR_HUB_FILTERS: PRHubFilters = {
  scope: 'mine',
  status: 'all',
  review: 'all',
  repo: 'all',
  authorType: 'all',
};

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
  status: string;
  conclusion: string | null;
  url: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface PRChecksResult {
  checks: PRCheck[];
  overall_status: string;
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

export interface GithubIssue {
  number: number;
  title: string;
  url: string;
  state: string;
  repo_name: string;
  author: string;
  created_at: string;
  updated_at: string;
  labels: string[];
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
