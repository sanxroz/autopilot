import type { GithubIssue, PRHubFilters, PRStatus } from '../types/github';

export type PRColumnKey = 'needs_review' | 'draft' | 'changes_requested' | 'in_review' | 'ready' | 'issues';

export type PRHubItem =
  | { type: 'pr'; id: string; repoPath: string; pr: PRStatus }
  | { type: 'issue'; id: string; issue: GithubIssue };

export interface PRHubColumn {
  key: PRColumnKey;
  items: PRHubItem[];
}

export function isReadyToMerge(pr: PRStatus): boolean {
  return (
    !pr.merged &&
    !pr.draft &&
    pr.state === 'open' &&
    pr.checks_status === 'success' &&
    (pr.review_decision === 'APPROVED' || pr.review_decision === null)
  );
}

export function classifyPR(pr: PRStatus, authUser: string | null): Exclude<PRColumnKey, 'issues'> {
  const isMine = authUser ? pr.author === authUser : false;

  if (pr.draft) return 'draft';
  if (pr.review_decision === 'CHANGES_REQUESTED') return 'changes_requested';
  if (isReadyToMerge(pr)) return 'ready';
  if (!isMine) return 'needs_review';
  return 'in_review';
}

export function applyPRHubFilters(
  pr: PRStatus,
  repoPath: string,
  filters: PRHubFilters,
  authUser: string | null,
): boolean {
  if (filters.scope === 'mine' && authUser) {
    const isMine = pr.author === authUser;
    const needsMyReview = pr.requested_reviewers.includes(authUser);
    if (!isMine && !needsMyReview) return false;
  }

  if (filters.status === 'draft' && !pr.draft) return false;
  if (filters.status === 'ready' && !isReadyToMerge(pr)) return false;
  if (filters.status === 'open' && pr.state !== 'open') return false;

  if (filters.review === 'needs_review' && !(pr.review_decision === 'REVIEW_REQUIRED' || pr.review_decision === null)) {
    return false;
  }
  if (filters.review === 'approved' && pr.review_decision !== 'APPROVED') return false;
  if (filters.review === 'changes_requested' && pr.review_decision !== 'CHANGES_REQUESTED') return false;

  if (filters.repo !== 'all' && filters.repo !== repoPath) return false;
  if (filters.authorType === 'bot' && !pr.is_bot) return false;
  if (filters.authorType === 'human' && pr.is_bot) return false;

  return true;
}

export function buildPRHubColumns(
  columnKeys: readonly PRColumnKey[],
  prHubData: Record<string, PRStatus[]>,
  assignedIssues: GithubIssue[],
  filters: PRHubFilters,
  authUser: string | null,
): PRHubColumn[] {
  const colMap = Object.fromEntries(columnKeys.map((key) => [key, [] as PRHubItem[]])) as Record<PRColumnKey, PRHubItem[]>;

  for (const [repoPath, prs] of Object.entries(prHubData)) {
    for (const pr of prs) {
      if (!applyPRHubFilters(pr, repoPath, filters, authUser)) continue;
      const item: PRHubItem = { type: 'pr', id: `pr:${repoPath}#${pr.number}`, repoPath, pr };
      const column = classifyPR(pr, authUser);
      if (column in colMap) {
        colMap[column].push(item);
      }
    }
  }

  if ('issues' in colMap) {
    colMap.issues = assignedIssues.map((issue) => ({
      type: 'issue' as const,
      id: `issue:${issue.repo_name}#${issue.number}`,
      issue,
    }));
  }

  for (const key of columnKeys) {
    if (key !== 'issues') {
      colMap[key] = sortPRHubItems(colMap[key], authUser);
    }
  }

  return columnKeys.map((key) => ({ key, items: colMap[key] }));
}

function reviewRank(pr: PRStatus): number {
  if (pr.review_decision === 'CHANGES_REQUESTED') return 0;
  if (pr.review_decision === 'REVIEW_REQUIRED' || pr.review_decision === null) return 1;
  if (pr.review_decision === 'APPROVED') return 2;
  return 3;
}

function checksRank(pr: PRStatus): number {
  if (pr.checks_status === 'failure') return 0;
  if (pr.checks_status === 'pending') return 1;
  if (pr.checks_status === 'success') return 2;
  return 3;
}

function sortPRHubItems(items: PRHubItem[], authUser: string | null): PRHubItem[] {
  return [...items].sort((a, b) => {
    if (a.type !== 'pr' || b.type !== 'pr') return 0;
    if (authUser) {
      const aNeeds = a.pr.requested_reviewers.includes(authUser) ? 0 : 1;
      const bNeeds = b.pr.requested_reviewers.includes(authUser) ? 0 : 1;
      if (aNeeds !== bNeeds) return aNeeds - bNeeds;
    }
    const rA = reviewRank(a.pr);
    const rB = reviewRank(b.pr);
    if (rA !== rB) return rA - rB;
    const cA = checksRank(a.pr);
    const cB = checksRank(b.pr);
    if (cA !== cB) return cA - cB;
    return new Date(a.pr.created_at).getTime() - new Date(b.pr.created_at).getTime();
  });
}
