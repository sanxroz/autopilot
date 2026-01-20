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
}

export interface RepoWithBranches {
  repo_path: string;
  branches: string[];
}

export interface RepoPRStatuses {
  repo_path: string;
  statuses: PRStatus[];
}

export interface GitHubSettings {
  pollingIntervalMs: number;
  ghCliAvailable: boolean;
  ghAuthUser: string | null;
}

export const DEFAULT_GITHUB_SETTINGS: GitHubSettings = {
  pollingIntervalMs: 30000,
  ghCliAvailable: false,
  ghAuthUser: null,
};

export const POLLING_INTERVALS = {
  fast: 15000,
  normal: 30000,
  slow: 60000,
} as const;

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
}

export interface PRDetailedInfo {
  merge_state_status: string;
  mergeable: string;
  comments: PRComment[];
  review_decision: string | null;
}
