import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  GitPullRequest,
  XCircle,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { cn } from '../utils/cn';
import { useAppStore } from '../store';
import { useMergePR } from '../hooks/useMergePR';
import { useThemeMode } from '../hooks/useTheme';
import { PRStatusBadge } from './PRStatusBadge';
import { PRFileTree } from './PRDetailView/PRFileTree';
import { PRDiffPanel } from './PRDetailView/PRDiffPanel';
import { PRMetadataSidebar } from './PRDetailView/PRMetadataSidebar';
import type { PRStatus, PRFile, PRCommit, PRDetailedInfo, PRComment } from '../types/github';

type PendingReviewComment = {
  path: string;
  line: number;
  body: string;
};

/* ── Helpers ───────────────────────────────────────────────────────── */

const AVATAR_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#F97316', '#14B8A6',
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#06B6D4',
];

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.split(/[\s-_]+/).filter((p) => p.length > 0);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 1) return parts[0].slice(0, 2).toUpperCase();
  return '??';
}

function Avatar({ name, size = 'md', className, title }: { name: string; size?: 'sm' | 'md'; className?: string; title?: string }) {
  const [imgError, setImgError] = useState(false);
  const bgColor = stringToColor(name);
  const initials = getInitials(name);
  const sizeClasses = size === 'sm' ? 'size-5 text-[8px]' : 'size-6 text-[9px]';
  const imgSizeClasses = size === 'sm' ? 'size-5' : 'size-6';
  const avatarUrl = `https://github.com/${name}.png?size=64`;

  if (!imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        title={title || name}
        onError={() => setImgError(true)}
        className={cn(imgSizeClasses, 'shrink-0 rounded-full object-cover', className)}
      />
    );
  }

  return (
    <div
      title={title || name}
      className={cn(sizeClasses, 'shrink-0 rounded-full flex items-center justify-center font-medium text-white', className)}
      style={{ background: bgColor }}
    >
      {initials}
    </div>
  );
}
function toAgeLabel(iso: string): string {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/* ── Constants ─────────────────────────────────────────────────────── */

const LEFT_SIDEBAR_DEFAULT = 220;
const LEFT_SIDEBAR_MIN = 160;
const LEFT_SIDEBAR_MAX = 400;
const RIGHT_SIDEBAR_DEFAULT = 320;
const RIGHT_SIDEBAR_MIN = 240;
const RIGHT_SIDEBAR_MAX = 480;

/* ── Props ─────────────────────────────────────────────────────────── */

interface PRDetailViewProps {
  pr: PRStatus;
  repoPath: string;
  repoName: string;
  onBack: () => void;
  onRefresh: () => void;
}

export function PRDetailView({
  pr,
  repoPath,
  repoName,
  onBack,
  onRefresh,
}: PRDetailViewProps) {
  const themeMode = useThemeMode();
  const isLightMode = themeMode === 'light';
  const githubSettings = useAppStore((state) => state.githubSettings);

  /* ── PR action state (preserved from original) ─────────────────── */
  const [isApproving, setIsApproving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const { isMerging, handleMerge } = useMergePR({
    repoPath,
    prNumber: pr.number,
  });

  /* ── 3-panel data state ────────────────────────────────────────── */
  const [files, setFiles] = useState<PRFile[]>([]);
  const [commits, setCommits] = useState<PRCommit[]>([]);
  const [fullDiff, setFullDiff] = useState<string | null>(null);
  const [prDetails, setPrDetails] = useState<PRDetailedInfo | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  const [pendingReviewComments, setPendingReviewComments] = useState<PendingReviewComment[]>([]);

  /* ── Sidebar resize state ──────────────────────────────────────── */
  const [leftWidth, setLeftWidth] = useState(LEFT_SIDEBAR_DEFAULT);
  const [rightWidth, setRightWidth] = useState(RIGHT_SIDEBAR_DEFAULT);
  const [resizingPanel, setResizingPanel] = useState<'left' | 'right' | null>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number }>({ startX: 0, startWidth: 0 });

  /* ── Data fetching ─────────────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    setIsDataLoading(true);
    try {
      const [filesResult, commitsResult, detailsResult] = await Promise.all([
        invoke<PRFile[]>('get_pr_files', { repoPath, prNumber: pr.number }),
        invoke<PRCommit[]>('get_pr_commits', { repoPath, prNumber: pr.number }),
        invoke<PRDetailedInfo>('get_pr_details', { repoPath, prNumber: pr.number }),
      ]);

      setFiles(filesResult);
      setCommits(commitsResult);
      setPrDetails(detailsResult);

      setSelectedFile((prevSelectedFile) => {
        if (filesResult.length === 0) {
          return null;
        }

        if (prevSelectedFile && filesResult.some((file) => file.path === prevSelectedFile)) {
          return prevSelectedFile;
        }

        return filesResult[0].path;
      });
    } catch (e) {
      console.error('Failed to fetch PR data:', e);
      toast.error(`Failed to load PR data: ${String(e)}`);
    } finally {
      setIsDataLoading(false);
    }
  }, [repoPath, pr.number]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  /* ── Fetch diff when we have files ─────────────────────────────── */
  const fetchDiff = useCallback(async () => {
    if (files.length === 0) {
      setFullDiff(null);
      return;
    }

    setIsDiffLoading(true);
    try {
      const diff = await invoke<string>('get_pr_file_diff', { repoPath, prNumber: pr.number });
      setFullDiff(diff);
    } catch (e) {
      console.error('Failed to fetch PR diff:', e);
    } finally {
      setIsDiffLoading(false);
    }
  }, [repoPath, pr.number, files.length]);

  useEffect(() => {
    void fetchDiff();
  }, [fetchDiff]);

  /* ── Resize handlers ───────────────────────────────────────────── */
  const handleResizeStart = useCallback(
    (panel: 'left' | 'right', e: React.MouseEvent) => {
      e.preventDefault();
      setResizingPanel(panel);
      resizeRef.current = {
        startX: e.clientX,
        startWidth: panel === 'left' ? leftWidth : rightWidth,
      };
    },
    [leftWidth, rightWidth]
  );

  useEffect(() => {
    if (!resizingPanel) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeRef.current.startX;
      if (resizingPanel === 'left') {
        const newWidth = Math.min(
          LEFT_SIDEBAR_MAX,
          Math.max(LEFT_SIDEBAR_MIN, resizeRef.current.startWidth + delta)
        );
        setLeftWidth(newWidth);
      } else {
        const newWidth = Math.min(
          RIGHT_SIDEBAR_MAX,
          Math.max(RIGHT_SIDEBAR_MIN, resizeRef.current.startWidth - delta)
        );
        setRightWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setResizingPanel(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingPanel]);

  /* ── PR actions (preserved from original) ──────────────────────── */
  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await invoke<boolean>('approve_pr', { repoPath, prNumber: pr.number });
      toast.success(`Approved #${pr.number}`);
      onRefresh();
    } catch (e) {
      toast.error(`Failed to approve: ${String(e)}`);
    } finally {
      setIsApproving(false);
    }
  };

  const handleClose = async () => {
    setIsClosing(true);
    try {
      await invoke<boolean>('close_pr', { repoPath, prNumber: pr.number });
      toast.success(`Closed #${pr.number}`);
      onRefresh();
    } catch (e) {
      toast.error(`Failed to close: ${String(e)}`);
    } finally {
      setIsClosing(false);
    }
  };

  const handleMergeClick = async () => {
    await handleMerge();
    onRefresh();
  };

  const handleSubmitReview = async ({
    type,
    body,
    pendingComments,
  }: {
    type: 'comment' | 'approve' | 'request_changes';
    body: string;
    pendingComments: PendingReviewComment[];
  }): Promise<boolean> => {
    const trimmedBody = body.trim();
    const normalizedPendingComments = pendingComments
      .map((comment) => ({
        ...comment,
        path: comment.path.trim(),
        body: comment.body.trim(),
      }))
      .filter((comment) => comment.path && comment.body);

    const hasBody = trimmedBody.length > 0;
    const hasComments = normalizedPendingComments.length > 0;

    if (type === 'comment' && !hasBody && !hasComments) {
      return false;
    }

    if (type === 'request_changes' && !hasBody && !hasComments) {
      return false;
    }

    const event = {
      comment: 'COMMENT',
      approve: 'APPROVE',
      request_changes: 'REQUEST_CHANGES',
    }[type] as 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES';

    try {
      await invoke<boolean>('submit_pr_review', {
        repoPath,
        prNumber: pr.number,
        event,
        body: hasBody ? trimmedBody : null,
        comments: normalizedPendingComments.map((comment) => ({
          path: comment.path,
          line: comment.line,
          body: comment.body,
          side: 'RIGHT' as const,
        })),
      });

      setPendingReviewComments((prev) =>
        prev.filter((comment) => {
          const normalizedCommentBody = comment.body.trim();
          const normalizedCommentPath = comment.path.trim();

          return !normalizedPendingComments.some(
            (submitted) =>
              submitted.path === normalizedCommentPath &&
              submitted.line === comment.line &&
              submitted.body === normalizedCommentBody
          );
        })
      );

      toast.success(
        type === 'approve'
          ? 'Review approved'
          : type === 'request_changes'
            ? 'Changes requested'
            : 'Review submitted'
      );

      void fetchData();
      onRefresh();
      return true;
    } catch (error) {
      toast.error(`Failed to submit review: ${String(error)}`);
      return false;
    }
  };

  const comments: PRComment[] = prDetails?.comments || [];

  return (
    <div className={cn('flex h-full flex-col', resizingPanel && 'select-none')}>
      {/* ── Header ── */}
      <div className="shrink-0 border-b border-border-subtle">
        {/* Top row: back + title + external link */}
        <div className="flex items-start gap-3 px-5 pt-4 pb-3">
          <button
            onClick={onBack}
            className="mt-0.5 shrink-0 rounded-md p-1 text-tertiary hover:text-primary hover:bg-hover transition-colors"
            aria-label="Back to board"
          >
            <ArrowLeft className="size-4" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <GitPullRequest className={cn(
                'size-4 shrink-0',
                pr.merged ? 'text-semantic-merged' : pr.state === 'closed' ? 'text-semantic-error' : pr.draft ? 'text-muted' : 'text-semantic-success',
              )} />
              <h1 className="text-sm font-semibold text-primary leading-snug text-balance">
                {pr.title}
              </h1>
              <span className="shrink-0 text-xs text-muted">#{pr.number}</span>
            </div>

            {/* Branch info */}
            <div className="mt-1.5 flex items-center gap-2 text-2xs text-muted">
              <code className="rounded bg-hover px-1.5 py-0.5 font-mono text-secondary">
                {pr.head_branch}
              </code>
            </div>
          </div>

          <a
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-md p-1.5 text-tertiary hover:text-primary hover:bg-hover transition-colors"
            aria-label="Open in GitHub"
          >
            <ExternalLink className="size-3.5" />
          </a>
        </div>

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 pb-3">
          <PRStatusBadge prStatus={pr} />

          {/* Checks badge */}
          {pr.checks_status === 'failure' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-semantic-error-muted px-2 py-0.5 text-2xs font-medium text-semantic-error">
              <XCircle className="size-3" /> Checks failing
            </span>
          )}
          {pr.checks_status === 'success' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-semantic-success-muted px-2 py-0.5 text-2xs font-medium text-semantic-success">
              <CheckCircle2 className="size-3" /> Checks passing
            </span>
          )}
          {pr.checks_status === 'pending' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-semantic-warning-muted px-2 py-0.5 text-2xs font-medium text-semantic-warning">
              <Clock className="size-3" /> Checks pending
            </span>
          )}

          <span className="text-2xs text-muted">·</span>

          {/* Author */}
          <span className="inline-flex items-center gap-1 text-2xs text-secondary">
            <Avatar name={pr.author} size="sm" />
            {pr.author}
          </span>

          <span className="text-2xs text-muted">·</span>

          {/* Repo */}
          <span className="text-2xs text-secondary">{repoName}</span>

          <span className="text-2xs text-muted">·</span>

          {/* Age */}
          <span className="text-2xs text-muted">{toAgeLabel(pr.updated_at)}</span>

          <span className="text-2xs text-muted">·</span>

          {/* Diff stats */}
          <span className="font-mono text-2xs tabular-nums">
            {pr.additions > 0 && <span className="text-semantic-success mr-1">+{pr.additions}</span>}
            {pr.deletions > 0 && <span className="text-semantic-error">−{pr.deletions}</span>}
          </span>

          {/* Reviewers */}
          {pr.requested_reviewers.length > 0 && (
            <>
              <span className="text-2xs text-muted">·</span>
              <div className="flex -space-x-1.5">
                {pr.requested_reviewers.map((reviewer) => (
                  <Avatar key={reviewer} name={reviewer} size="sm" title={reviewer} />
                ))}
              </div>
            </>
          )}
        </div>

      </div>

      {/* ── 3-Panel Layout ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — File tree */}
        <div
          className="shrink-0 border-r border-border-subtle bg-primary overflow-hidden"
          style={{ width: `${leftWidth}px` }}
        >
          <PRFileTree
            files={files}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
            isLoading={isDataLoading}
          />
        </div>

        {/* Left resize handle */}
        <div
          onMouseDown={(e) => handleResizeStart('left', e)}
          className={cn(
            'w-1 shrink-0 cursor-col-resize z-10',
            resizingPanel === 'left' ? 'bg-accent-primary/40' : 'bg-transparent hover:bg-border-subtle'
          )}
        />

        {/* Center panel — Diff viewer */}
        <div className="flex-1 min-w-0 bg-primary overflow-hidden">
          <PRDiffPanel
            files={files}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
            fullDiff={fullDiff}
            isDiffLoading={isDiffLoading}
            comments={comments}
            isLightMode={isLightMode}
            repoPath={repoPath}
            prNumber={pr.number}
            onCommentAdded={onRefresh}
            pendingReviewComments={pendingReviewComments}
            onPendingReviewCommentsChange={setPendingReviewComments}
            currentUser={githubSettings.ghAuthUser || pr.author}
          />
        </div>

        {/* Right resize handle */}
        <div
          onMouseDown={(e) => handleResizeStart('right', e)}
          className={cn(
            'w-1 shrink-0 cursor-col-resize z-10',
            resizingPanel === 'right' ? 'bg-accent-primary/40' : 'bg-transparent hover:bg-border-subtle'
          )}
        />

        {/* Right sidebar — Metadata */}
        <div
          className="shrink-0 border-l border-border-subtle bg-primary overflow-visible"
          style={{ width: `${rightWidth}px` }}
        >
          <PRMetadataSidebar
            pr={pr}
            body={prDetails?.body ?? null}
            commits={commits}
            comments={comments}
            isLoading={isDataLoading}
            repoPath={repoPath}
            onApprove={handleApprove}
            onMerge={handleMergeClick}
            onClose={handleClose}
            isApproving={isApproving}
            isMerging={isMerging}
            isClosing={isClosing}
            pendingReviewComments={pendingReviewComments}
            onSubmitReview={handleSubmitReview}
          />
        </div>
      </div>
    </div>
  );
}
