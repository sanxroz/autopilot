import { useCallback, useEffect, useMemo, useState, type ComponentPropsWithoutRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
  ChevronDown,
  CircleDot,
  Clock,
  Eye,
  GitMerge,
  GitPullRequest,
  Loader,
  Pencil,
  Tag,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useAppStore } from '../store';
import type { GithubIssue, PRHubFilters, PRStatus, RepoPRStatuses, RepoPathInput } from '../types/github';
import { cn } from '../utils/cn';
import { PRKanbanCard, type PRAction } from './PRKanbanCard';
import { PRDetailView } from './PRDetailView';

/* ── Types ─────────────────────────────────────────────────────────── */

type HubItem =
  | { type: 'pr'; id: string; repoPath: string; pr: PRStatus }
  | { type: 'issue'; id: string; issue: GithubIssue };

type ColumnKey = 'needs_review' | 'draft' | 'changes_requested' | 'in_review' | 'ready' | 'issues';

const COLUMN_DEFS: { key: ColumnKey; label: string; icon: LucideIcon; dotColor: string }[] = [
  { key: 'needs_review', label: 'Needs Review', icon: Eye, dotColor: 'bg-semantic-warning' },
  { key: 'draft', label: 'Drafts', icon: Pencil, dotColor: 'bg-tertiary' },
  { key: 'changes_requested', label: 'Changes Requested', icon: XCircle, dotColor: 'bg-semantic-error' },
  { key: 'in_review', label: 'In Review', icon: Clock, dotColor: 'bg-semantic-info' },
  { key: 'ready', label: 'Ready to Merge', icon: GitMerge, dotColor: 'bg-semantic-success' },
  { key: 'issues', label: 'Issues', icon: CircleDot, dotColor: 'bg-semantic-merged' },
];

/* ── Helpers ────────────────────────────────────────────────────────── */

function toAgeLabel(iso: string): string {
  if (!iso) return 'unknown';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return 'unknown';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
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

function applyFilters(pr: PRStatus, repoPath: string, filters: PRHubFilters, authUser: string | null): boolean {
  // Scope: 'mine' = only my PRs + PRs where I'm requested reviewer
  if (filters.scope === 'mine' && authUser) {
    const isMine = pr.author === authUser;
    const needsMyReview = pr.requested_reviewers.includes(authUser);
    if (!isMine && !needsMyReview) return false;
  }

  if (filters.status === 'draft' && !pr.draft) return false;
  if (filters.status === 'ready' && pr.draft) return false;
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

function sortItems(items: HubItem[], authUser: string | null): HubItem[] {
  return [...items].sort((a, b) => {
    if (a.type !== 'pr' || b.type !== 'pr') return 0;
    // PRs requesting my review float to top
    if (authUser) {
      const aNeeds = a.pr.requested_reviewers.includes(authUser) ? 0 : 1;
      const bNeeds = b.pr.requested_reviewers.includes(authUser) ? 0 : 1;
      if (aNeeds !== bNeeds) return aNeeds - bNeeds;
    }
    const rA = reviewRank(a.pr), rB = reviewRank(b.pr);
    if (rA !== rB) return rA - rB;
    const cA = checksRank(a.pr), cB = checksRank(b.pr);
    if (cA !== cB) return cA - cB;
    return new Date(a.pr.created_at).getTime() - new Date(b.pr.created_at).getTime();
  });
}

/* ── FilterSelect ──────────────────────────────────────────────────── */

const filterSelectClass = cn(
  'appearance-none rounded-md bg-transparent',
  'pl-2 pr-6 py-1 text-xs text-secondary',
  'hover:bg-hover hover:text-primary focus:outline-none',
  'transition-colors cursor-pointer',
);

function FilterSelect({
  children,
  ...props
}: ComponentPropsWithoutRef<'select'>) {
  return (
    <div className="relative inline-flex items-center">
      <select className={filterSelectClass} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 size-3 text-tertiary" />
    </div>
  );
}

/* ── IssueDetail (expanded) ────────────────────────────────────────── */

function IssueDetail({ issue }: { issue: GithubIssue }) {
  return (
    <div className="border-t border-border-subtle px-3 pb-3 pt-2">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium',
            issue.state === 'open'
              ? 'bg-semantic-success-muted text-semantic-success'
              : 'bg-semantic-merged-muted text-semantic-merged',
          )}>
            <CircleDot className="size-2.5" />
            {issue.state === 'open' ? 'Open' : 'Closed'}
          </span>
          <span className="text-2xs text-muted">
            opened by {issue.author}
          </span>
          <span className="text-2xs text-muted">
            {toAgeLabel(issue.created_at)} ago
          </span>
        </div>
        {issue.labels.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag className="size-3 text-muted" />
            {issue.labels.map((label) => (
              <span
                key={label}
                className="rounded-full border border-border-subtle px-1.5 py-0.5 text-2xs text-secondary"
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main component ────────────────────────────────────────────────── */

export function PRHub() {
  const repositories = useAppStore((state) => state.repositories);
  const prHubData = useAppStore((state) => state.prHubData);
  const assignedIssues = useAppStore((state) => state.assignedIssues);

  const setPRHubData = useAppStore((state) => state.setPRHubData);
  const setAssignedIssues = useAppStore((state) => state.setAssignedIssues);
  const githubSettings = useAppStore((state) => state.githubSettings);
  const prHubFilters = useAppStore((state) => state.prHubFilters);
  const setPRHubFilters = useAppStore((state) => state.setPRHubFilters);
  const setPRHubOpen = useAppStore((state) => state.setPRHubOpen);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusedCol, setFocusedCol] = useState(0);
  const [focusedRow, setFocusedRow] = useState(0);
  const [batchRunning, setBatchRunning] = useState<PRAction | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [selectedPR, setSelectedPR] = useState<{ repoPath: string; pr: PRStatus } | null>(null);

  const hasData = Object.keys(prHubData).length > 0;

  const refreshData = useCallback(async () => {
    try {
      const repos: RepoPathInput[] = repositories.map((r) => ({ repo_path: r.info.path }));
      const [prResults, issues] = await Promise.all([
        invoke<RepoPRStatuses[]>('get_all_open_prs_for_repos', { repos }),
        invoke<GithubIssue[]>('get_assigned_issues').catch(() => [] as GithubIssue[]),
      ]);
      const next: Record<string, RepoPRStatuses['statuses']> = {};
      for (const result of prResults) {
        next[result.repo_path] = result.statuses;
      }
      setPRHubData(next);
      setAssignedIssues(issues);
    } catch (e) {
      console.error('Failed to refresh PR Hub data:', e);
    }
  }, [repositories, setPRHubData, setAssignedIssues]);

  const repoNameByPath = useMemo(() => {
    const m = new Map<string, string>();
    for (const repo of repositories) {
      m.set(repo.info.path, repo.info.name || repo.info.path);
    }
    return m;
  }, [repositories]);

  const authUser = githubSettings.ghAuthUser;

  /* ── Build columns ── */

  const columns = useMemo(() => {
    const colMap: Record<ColumnKey, HubItem[]> = {
      needs_review: [],
      draft: [],
      changes_requested: [],
      in_review: [],
      ready: [],
      issues: [],
    };

    for (const [repoPath, prs] of Object.entries(prHubData)) {
      const filtered = prs.filter((pr) => applyFilters(pr, repoPath, prHubFilters, authUser));

      for (const pr of filtered) {
        const item: HubItem = { type: 'pr', id: `pr:${repoPath}#${pr.number}`, repoPath, pr };
        const isMine = authUser ? pr.author === authUser : false;

        if (pr.draft) {
          colMap.draft.push(item);
        } else if (pr.review_decision === 'CHANGES_REQUESTED') {
          colMap.changes_requested.push(item);
        } else if (pr.review_decision === 'APPROVED') {
          colMap.ready.push(item);
        } else if (!isMine) {
          colMap.needs_review.push(item);
        } else {
          colMap.in_review.push(item);
        }
      }
    }

    // Sort each PR column
    for (const key of ['needs_review', 'draft', 'changes_requested', 'in_review', 'ready'] as ColumnKey[]) {
      colMap[key] = sortItems(colMap[key], authUser);
    }

    colMap.issues = assignedIssues.map((issue) => ({
      type: 'issue' as const,
      id: `issue:${issue.repo_name}#${issue.number}`,
      issue,
    }));

    return COLUMN_DEFS.map((def) => ({
      ...def,
      items: colMap[def.key],
    }));
  }, [prHubData, prHubFilters, authUser, assignedIssues]);

  const visibleColumns = useMemo(() => columns.filter((c) => c.items.length > 0), [columns]);

  /* ── Derived values ── */

  const totalItemCount = useMemo(() => columns.reduce((s, c) => s + c.items.length, 0), [columns]);

  const allPRIds = useMemo(() => {
    const ids: string[] = [];
    for (const col of columns) {
      for (const item of col.items) {
        if (item.type === 'pr') ids.push(item.id);
      }
    }
    return ids;
  }, [columns]);

  // Clamp focus when columns change
  useEffect(() => {
    setFocusedCol((c) => Math.max(0, Math.min(c, visibleColumns.length - 1)));
  }, [visibleColumns.length]);

  useEffect(() => {
    const col = visibleColumns[focusedCol];
    if (col) {
      setFocusedRow((r) => Math.min(r, Math.max(0, col.items.length - 1)));
    }
  }, [focusedCol, columns]);

  /* ── Handlers ── */

  const handleUpdateFilter = async (patch: Partial<PRHubFilters>) => {
    await setPRHubFilters(patch);
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllReadyToMerge = () => {
    const next = new Set(selected);
    for (const col of columns) {
      for (const item of col.items) {
        if (item.type !== 'pr') continue;
        const { pr, id } = item;
        const ready = !pr.draft && pr.state === 'open' && pr.checks_status === 'success' && (pr.review_decision === 'APPROVED' || pr.review_decision === null);
        if (ready) next.add(id);
      }
    }
    setSelected(next);
  };

  /* ── PR actions ── */

  const getRepoPathFromId = (id: string): string => {
    const inner = id.replace(/^pr:/, '');
    return inner.split('#')[0];
  };

  const getPRNumberFromId = (id: string): number => {
    const inner = id.replace(/^pr:/, '');
    return Number(inner.split('#')[1]);
  };

  const runSingleAction = async (repoPath: string, prNumber: number, action: PRAction) => {
    if (action === 'approve') {
      await invoke<boolean>('approve_pr', { repoPath, prNumber });
      toast.success(`Approved #${prNumber}`);
      return;
    }
    if (action === 'close') {
      await invoke<boolean>('close_pr', { repoPath, prNumber });
      toast.success(`Closed #${prNumber}`);
      return;
    }
    const result = await invoke<{ success: boolean; message: string }>('merge_pr', { repoPath, prNumber });
    if (!result.success) {
      throw new Error(result.message || `Failed to merge #${prNumber}`);
    }
    toast.success(`Merged #${prNumber}`);
  };


  const runBatch = async (action: PRAction) => {
    const items = Array.from(selected)
      .filter((id) => id.startsWith('pr:'))
      .map((id) => ({
        repoPath: getRepoPathFromId(id),
        prNumber: getPRNumberFromId(id),
      }));
    if (items.length === 0) return;

    setBatchRunning(action);
    setBatchProgress({ done: 0, total: items.length });

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      try {
        await runSingleAction(item.repoPath, item.prNumber, action);
      } catch (e) {
        toast.error(`Failed ${action} on #${item.prNumber}: ${String(e)}`);
      } finally {
        setBatchProgress({ done: i + 1, total: items.length });
      }
    }

    toast.success(`Batch ${action} finished (${items.length})`);
    setBatchRunning(null);
    setSelected(new Set());
    void refreshData();
  };

  /* ── 2D keyboard navigation ── */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't navigate when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Escape closes detail view
      if (e.key === 'Escape' && selectedPR) {
        e.preventDefault();
        setSelectedPR(null);
        return;
      }

      // Don't process board navigation when detail view is open
      if (selectedPR) return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const col = visibleColumns[focusedCol];
        if (col) setFocusedRow((r) => Math.min(r + 1, col.items.length - 1));
        return;
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedRow((r) => Math.max(r - 1, 0));
        return;
      }
      if (e.key === 'h' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setFocusedCol((c) => Math.max(c - 1, 0));
        setFocusedRow(0);
        return;
      }
      if (e.key === 'l' || e.key === 'ArrowRight') {
        e.preventDefault();
        setFocusedCol((c) => Math.max(0, Math.min(c + 1, visibleColumns.length - 1)));
        setFocusedRow(0);
        return;
      }

      const col = visibleColumns[focusedCol];
      const focused = col?.items[focusedRow];
      if (!focused) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (selected.size > 0) {
          void runBatch('merge');
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (focused.type === 'pr') {
          setSelectedPR({ repoPath: focused.repoPath, pr: focused.pr });
        } else {
          toggleExpanded(focused.id);
        }
        return;
      }

      if (e.key === 'x' && focused.type === 'pr') {
        e.preventDefault();
        toggleSelected(focused.id);
        return;
      }

      if (focused.type === 'pr') {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          void runSingleAction(focused.repoPath, focused.pr.number, 'approve');
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'm') {
          e.preventDefault();
          void runSingleAction(focused.repoPath, focused.pr.number, 'merge');
          return;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visibleColumns, focusedCol, focusedRow, selected, selectedPR]);

  /* ── Render ── */

  if (selectedPR) {
    return (
      <PRDetailView
        pr={selectedPR.pr}
        repoPath={selectedPR.repoPath}
        repoName={repoNameByPath.get(selectedPR.repoPath) || selectedPR.repoPath.split('/').pop() || ''}
        onBack={() => setSelectedPR(null)}
        onRefresh={() => void refreshData()}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Header Area ── */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-4 py-2">
        <FilterSelect
          value={prHubFilters.scope}
          onChange={(e) => void handleUpdateFilter({ scope: e.target.value as PRHubFilters['scope'] })}
        >
          <option value="mine">My PRs</option>
          <option value="all">All PRs</option>
        </FilterSelect>

        <FilterSelect
          value={prHubFilters.status}
          onChange={(e) => void handleUpdateFilter({ status: e.target.value as PRHubFilters['status'] })}
        >
          <option value="all">All status</option>
          <option value="open">Open</option>
          <option value="draft">Draft</option>
          <option value="ready">Ready</option>
        </FilterSelect>

        <FilterSelect
          value={prHubFilters.review}
          onChange={(e) => void handleUpdateFilter({ review: e.target.value as PRHubFilters['review'] })}
        >
          <option value="all">All reviews</option>
          <option value="needs_review">Needs review</option>
          <option value="approved">Approved</option>
          <option value="changes_requested">Changes requested</option>
        </FilterSelect>

        <FilterSelect
          value={prHubFilters.repo}
          onChange={(e) => void handleUpdateFilter({ repo: e.target.value })}
        >
          <option value="all">All repos</option>
          {Object.keys(prHubData).map((repoPath) => (
            <option key={repoPath} value={repoPath}>
              {repoNameByPath.get(repoPath) || repoPath}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          value={prHubFilters.authorType}
          onChange={(e) => void handleUpdateFilter({ authorType: e.target.value as PRHubFilters['authorType'] })}
        >
          <option value="all">All authors</option>
          <option value="human">Human</option>
          <option value="bot">Bot</option>
        </FilterSelect>

          <div className="flex-1" />

          <span className="text-xs text-tertiary tabular-nums">
            {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}
          </span>
          <button
            className="rounded-md px-2 py-1 text-xs text-tertiary hover:text-primary hover:bg-hover transition-colors"
            onClick={() => setSelected(new Set(allPRIds))}
          >
            Select all
          </button>
          <button
            onClick={() => setPRHubOpen(false)}
            className="rounded-md px-2 py-1 text-xs text-tertiary hover:text-primary hover:bg-hover transition-colors"
          >
            Close
          </button>
        </div>

      {/* ── Kanban board ── */}
      {totalItemCount === 0 && !hasData && repositories.length > 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center">
            <Loader className="size-6 animate-spin text-muted" />
            <p className="mt-3 text-sm text-secondary">Loading pull requests…</p>
          </div>
        </div>
      ) : totalItemCount === 0 && hasData ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center">
            <GitPullRequest className="size-8 text-muted" />
            <p className="mt-3 text-sm text-secondary">No items match your filters</p>
            <button
              className="mt-3 text-xs text-accent-primary hover:text-accent-hover transition-colors"
              onClick={() => void handleUpdateFilter({ status: 'all', review: 'all', repo: 'all', authorType: 'all' })}
            >
              Clear all filters
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-x-auto px-6 py-4 gap-6">
          {visibleColumns.map((col, colIndex) => {
            const isActiveCol = colIndex === focusedCol;

            return (
              <div
                key={col.key}
                className="flex-1 min-w-[200px] flex flex-col"
              >
                {/* Column header */}
                <div className="flex items-center gap-2 pb-3 shrink-0">
                  <span className={cn('size-2 rounded-full shrink-0', col.dotColor)} />
                  <span className="text-sm font-medium text-primary">{col.label}</span>
                  <span className="text-sm text-tertiary tabular-nums">{col.items.length}</span>
                </div>

                {/* Column body */}
                <div className="flex-1 overflow-y-auto space-y-2">
                  {col.items.map((item, rowIndex) => {
                    const isFocused = isActiveCol && rowIndex === focusedRow;

                    if (item.type === 'pr') {
                      return (
                        <PRKanbanCard
                          key={item.id}
                          pr={item.pr}
                          repoPath={item.repoPath}
                          repoName={repoNameByPath.get(item.repoPath) || item.repoPath.split('/').pop() || ''}
                          isFocused={isFocused}
                          isSelected={selected.has(item.id)}
                          needsMyReview={!!authUser && item.pr.requested_reviewers.includes(authUser)}
                          onToggleSelect={() => toggleSelected(item.id)}
                          onAction={(action) => void runSingleAction(item.repoPath, item.pr.number, action)}
                          onOpenDetail={() => setSelectedPR({ repoPath: item.repoPath, pr: item.pr })}
                        />
                      );
                    }

                    // Issue card — minimal style
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          'rounded-lg border bg-primary transition-all cursor-pointer',
                          isFocused
                            ? 'border-accent-primary ring-1 ring-accent-primary/40'
                            : 'border-border-subtle hover:border-border',
                        )}
                        onClick={() => toggleExpanded(item.id)}
                      >
                        <div className="px-3 py-2.5">
                          <p className="text-sm font-medium text-primary leading-snug line-clamp-2">
                            {item.issue.title}
                          </p>
                          <div className="mt-1.5 flex items-center text-xs text-muted">
                            <span className="truncate">
                              {item.issue.author} · {item.issue.repo_name}
                            </span>
                            <span className="ml-auto shrink-0 pl-3 tabular-nums">
                              {toAgeLabel(item.issue.updated_at)}
                            </span>
                          </div>
                        </div>
                        {expanded.has(item.id) && <IssueDetail issue={item.issue} />}
                      </div>
                    );
                  })}

                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Floating batch action bar ── */}
      {selected.size > 0 && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-xl border border-border-strong bg-solid px-4 py-2 shadow-lg">
            <span className="text-xs font-medium text-secondary tabular-nums">
              {selected.size} selected
            </span>

            <div className="mx-1 h-4 w-px bg-border" />

            <button
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-primary hover:bg-semantic-success-muted hover:text-semantic-success transition-colors disabled:opacity-40"
              onClick={() => void runBatch('approve')}
              disabled={!!batchRunning}
            >
              Approve
            </button>
            <button
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-primary hover:bg-hover transition-colors disabled:opacity-40"
              onClick={() => void runBatch('merge')}
              disabled={!!batchRunning}
            >
              Merge
            </button>
            <button
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-primary hover:bg-semantic-error-muted hover:text-semantic-error transition-colors disabled:opacity-40"
              onClick={() => void runBatch('close')}
              disabled={!!batchRunning}
            >
              Close
            </button>

            <div className="mx-1 h-4 w-px bg-border" />

            <button
              className="rounded-lg px-2.5 py-1 text-xs text-secondary hover:text-primary hover:bg-hover transition-colors"
              onClick={selectAllReadyToMerge}
            >
              Select ready
            </button>

            <button
              className="rounded-md p-1 text-muted hover:text-primary hover:bg-hover transition-colors"
              onClick={() => setSelected(new Set())}
              aria-label="Clear selection"
            >
              <X className="size-3.5" />
            </button>

            {batchRunning && (
              <>
                <div className="mx-1 h-4 w-px bg-border" />
                <span className="text-xs text-accent-primary tabular-nums">
                  {batchRunning}: {batchProgress.done}/{batchProgress.total}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
