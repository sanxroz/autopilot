import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  GitMerge,
  Loader,
  MessageSquare,
  XCircle,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { cn } from '../../utils/cn';
import { markdownComponents } from '../../lib/markdown-components';
import type { PRStatus, PRCommit, PRComment } from '../../types/github';

type PendingReviewComment = {
  path: string;
  line: number;
  body: string;
};

/* ── Avatar (matching CommentsTab pattern) ─────────────────────────── */

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

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
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
        title={name}
        onError={() => setImgError(true)}
        className={cn(imgSizeClasses, 'shrink-0 rounded-full object-cover')}
      />
    );
  }

  return (
    <div
      className={cn(sizeClasses, 'shrink-0 rounded-full flex items-center justify-center font-medium text-white')}
      style={{ background: bgColor }}
    >
      {initials}
    </div>
  );
}

/* ── Time helpers ──────────────────────────────────────────────────── */

function toAgeLabel(iso: string): string {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}



/* ── PRMetadataSidebar (main export) ───────────────────────────────── */

interface PRMetadataSidebarProps {
  pr: PRStatus;
  body: string | null;
  commits: PRCommit[];
  comments: PRComment[];
  isLoading: boolean;
  repoPath: string;
  onApprove: () => Promise<void>;
  onMerge: () => Promise<void>;
  onClose: () => Promise<void>;
  isApproving: boolean;
  isMerging: boolean;
  isClosing: boolean;
  isCommenting: boolean;
  isRequesting: boolean;
  pendingReviewComments: PendingReviewComment[];
  onSubmitReview: (payload: {
    type: 'comment' | 'approve' | 'request_changes';
    body: string;
    pendingComments: PendingReviewComment[];
  }) => Promise<boolean>;
}

export function PRMetadataSidebar({
  pr,
  body,
  isLoading,
  onApprove,
  onMerge,
  onClose,
  isApproving,
  isMerging,
  isClosing,
  isCommenting,
  isRequesting,
  pendingReviewComments,
  onSubmitReview,
}: PRMetadataSidebarProps) {
  const [showFullBody, setShowFullBody] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewType, setReviewType] = useState<'comment' | 'approve' | 'request_changes'>('comment');
  const [reviewText, setReviewText] = useState('');
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const reviewRef = useRef<HTMLDivElement | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const reviewMenuRef = useRef<HTMLDivElement | null>(null);
  const [actionsMenuPos, setActionsMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [reviewMenuPos, setReviewMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const updateActionsMenuPos = () => {
    if (!actionsRef.current) return;
    const rect = actionsRef.current.getBoundingClientRect();
    setActionsMenuPos({
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
    });
  };

  const updateReviewMenuPos = () => {
    if (!reviewRef.current) return;
    const rect = reviewRef.current.getBoundingClientRect();
    setReviewMenuPos({
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
    });
  };

  useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        actionsRef.current &&
        !actionsRef.current.contains(target) &&
        !(actionsMenuRef.current && actionsMenuRef.current.contains(target))
      ) {
        setIsActionsOpen(false);
      }
      if (
        reviewRef.current &&
        !reviewRef.current.contains(target) &&
        !(reviewMenuRef.current && reviewMenuRef.current.contains(target))
      ) {
        setIsReviewOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocMouseDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
    };
  }, []);

  useLayoutEffect(() => {
    if (!isActionsOpen) return;
    updateActionsMenuPos();

    const handlePositionUpdate = () => updateActionsMenuPos();
    window.addEventListener('resize', handlePositionUpdate);
    window.addEventListener('scroll', handlePositionUpdate, true);
    return () => {
      window.removeEventListener('resize', handlePositionUpdate);
      window.removeEventListener('scroll', handlePositionUpdate, true);
    };
  }, [isActionsOpen]);

  useLayoutEffect(() => {
    if (!isReviewOpen) return;
    updateReviewMenuPos();

    const handlePositionUpdate = () => updateReviewMenuPos();
    window.addEventListener('resize', handlePositionUpdate);
    window.addEventListener('scroll', handlePositionUpdate, true);
    return () => {
      window.removeEventListener('resize', handlePositionUpdate);
      window.removeEventListener('scroll', handlePositionUpdate, true);
    };
  }, [isReviewOpen]);

  // Compact markdown components for description
  const compactMdComponents = {
    ...markdownComponents,
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="my-1 text-xs leading-relaxed text-secondary first:mt-0 last:mb-0">{children}</p>
    ),
  };

  const rawBodyText = body?.trim() || '';
  const bodyText = rawBodyText.replace(/<!--[\s\S]*?-->/g, '').trim() || null;
  const isLongBody = bodyText ? bodyText.length > 400 : false;
  const displayBody = bodyText && !showFullBody && isLongBody ? bodyText.slice(0, 400) + '…' : bodyText;
  const isOpen = pr.state === 'open' && !pr.merged;
  const isApproved = pr.review_decision === 'APPROVED';
  const checksPass = pr.checks_status === 'success';
  const reviewBusy = isCommenting || isApproving || isRequesting || isSubmittingReview;

  const submitReview = async () => {
    const text = reviewText.trim();
    if (reviewType === 'comment' && !text && pendingReviewComments.length === 0) return;
    if (reviewType === 'request_changes' && !text) return;

    setIsSubmittingReview(true);
    const didSubmit = await onSubmitReview({
      type: reviewType,
      body: text,
      pendingComments: pendingReviewComments,
    });
    setIsSubmittingReview(false);

    if (didSubmit) {
      setReviewText('');
      setIsReviewOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="space-y-4 px-4 py-4">
          {/* Author skeleton */}
          <div className="flex items-center gap-3">
            <div className="size-6 rounded-full bg-hover" />
            <div className="space-y-1">
              <div className="h-3.5 w-24 rounded bg-hover" />
              <div className="h-3 w-16 rounded bg-hover" />
            </div>
          </div>
          {/* Body skeleton */}
          <div className="space-y-1.5">
            <div className="h-3 w-full rounded bg-hover" />
            <div className="h-3 w-4/5 rounded bg-hover" />
            <div className="h-3 w-3/5 rounded bg-hover" />
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {isOpen && (
        <div className="border-b border-border-subtle px-4 py-3">
          <div className="flex items-center gap-2">
            <div ref={actionsRef} className="relative flex items-center">
              <button
                onClick={() => void onMerge()}
                disabled={isMerging || !checksPass}
                className={cn(
                  'rounded-l-md border border-border-subtle px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                  checksPass && isApproved
                    ? 'border-semantic-success bg-semantic-success text-white hover:bg-semantic-success/90'
                    : 'bg-primary text-secondary hover:bg-hover hover:text-primary'
                )}
              >
                {isMerging ? <Loader className="mr-1 inline size-3 animate-spin" /> : <GitMerge className="mr-1 inline size-3" />}
                {isMerging ? 'Merging…' : 'Merge'}
              </button>
              <button
                onClick={() => setIsActionsOpen((v) => !v)}
                className="rounded-r-md border border-l-0 border-border-subtle px-2 py-1.5 text-xs text-secondary transition-colors hover:bg-hover hover:text-primary"
                aria-label="Open pull request actions"
              >
                <ChevronDown className="size-3.5" />
              </button>

              {isActionsOpen && actionsMenuPos && createPortal(
                <div
                  ref={actionsMenuRef}
                  style={{ position: 'fixed', top: actionsMenuPos.top, right: actionsMenuPos.right }}
                  className="z-50 min-w-40 rounded-md border border-border-subtle bg-primary p-1 shadow-sm"
                >
                  <button
                    onClick={() => {
                      void onApprove();
                      setIsActionsOpen(false);
                    }}
                    disabled={isApproving}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-secondary transition-colors hover:bg-hover hover:text-primary disabled:opacity-50"
                  >
                    {isApproving ? <Loader className="size-3 animate-spin" /> : <CheckCircle2 className="size-3 text-semantic-success" />}
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      void onMerge();
                      setIsActionsOpen(false);
                    }}
                    disabled={isMerging || !checksPass}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-secondary transition-colors hover:bg-hover hover:text-primary disabled:opacity-50"
                  >
                    {isMerging ? <Loader className="size-3 animate-spin" /> : <GitMerge className="size-3 text-semantic-success" />}
                    Merge
                  </button>
                  <button
                    onClick={() => {
                      void onClose();
                      setIsActionsOpen(false);
                    }}
                    disabled={isClosing}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-secondary transition-colors hover:bg-hover hover:text-primary disabled:opacity-50"
                  >
                    {isClosing ? <Loader className="size-3 animate-spin" /> : <XCircle className="size-3 text-semantic-error" />}
                    Close
                  </button>
                </div>,
                document.body
              )}
            </div>

            <div ref={reviewRef} className="relative">
              <button
                onClick={() => {
                  setIsReviewOpen((v) => !v);
                  updateReviewMenuPos();
                }}
                className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-primary px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-hover hover:text-primary"
              >
                <Eye className="size-3.5" />
                Review
                {pendingReviewComments.length > 0 && (
                  <span className="rounded-full bg-semantic-warning-muted px-1.5 py-0.5 text-2xs font-medium text-semantic-warning tabular-nums">
                    {pendingReviewComments.length}
                  </span>
                )}
                <ChevronDown className="size-3.5" />
              </button>

              {isReviewOpen && reviewMenuPos && createPortal(
                <div
                  ref={reviewMenuRef}
                  style={{ position: 'fixed', top: reviewMenuPos.top, right: reviewMenuPos.right }}
                  className="z-50 w-80 rounded-md border border-border-subtle bg-primary p-3 shadow-sm"
                >
                  <textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Leave a comment"
                    className="h-24 w-full resize-y rounded-md border border-border-subtle bg-primary px-2.5 py-2 text-xs text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary"
                  />

                  {pendingReviewComments.length > 0 && (
                    <div className="mt-2 rounded-md border border-semantic-warning bg-semantic-warning-muted px-2 py-1.5 text-2xs text-semantic-warning">
                      {pendingReviewComments.length} pending inline comment{pendingReviewComments.length !== 1 ? 's' : ''} will be included.
                    </div>
                  )}

                  <div className="mt-3 space-y-1.5">
                    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-transparent px-2 py-1.5 text-xs transition-colors hover:bg-hover">
                      <input
                        type="radio"
                        name="review-type"
                        checked={reviewType === 'comment'}
                        onChange={() => setReviewType('comment')}
                        className="mt-0.5"
                      />
                      <MessageSquare className="mt-0.5 size-3.5 text-secondary" />
                      <span className="text-pretty text-secondary">General feedback without explicit approval.</span>
                    </label>

                    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-transparent px-2 py-1.5 text-xs transition-colors hover:bg-hover">
                      <input
                        type="radio"
                        name="review-type"
                        checked={reviewType === 'approve'}
                        onChange={() => setReviewType('approve')}
                        className="mt-0.5"
                      />
                      <CheckCircle2 className="mt-0.5 size-3.5 text-semantic-success" />
                      <span className="text-pretty text-secondary">Approve merging these changes.</span>
                    </label>

                    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-transparent px-2 py-1.5 text-xs transition-colors hover:bg-hover">
                      <input
                        type="radio"
                        name="review-type"
                        checked={reviewType === 'request_changes'}
                        onChange={() => setReviewType('request_changes')}
                        className="mt-0.5"
                      />
                      <AlertTriangle className="mt-0.5 size-3.5 text-semantic-warning" />
                      <span className="text-pretty text-secondary">Changes must be addressed before merging.</span>
                    </label>
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      onClick={() => {
                        setIsReviewOpen(false);
                        setReviewText('');
                      }}
                      className="rounded-md border border-border-subtle px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-hover hover:text-primary"
                    >
                      CANCEL
                    </button>
                    <button
                      onClick={() => void submitReview()}
                      disabled={reviewBusy || (reviewType === 'request_changes' && !reviewText.trim()) || (reviewType === 'comment' && !reviewText.trim() && pendingReviewComments.length === 0)}
                      className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-black/90 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/90"
                    >
                      {reviewBusy ? <Loader className="inline size-3 animate-spin" /> : 'SUBMIT REVIEW'}
                    </button>
                  </div>
                </div>,
                document.body
              )}
            </div>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">

      {/* Author section */}
      <div className="border-b border-border-subtle px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Avatar name={pr.author} />
          <div className="min-w-0">
            <span className="block text-xs font-medium text-primary">{pr.author}</span>
            <span className="text-2xs text-muted">opened {toAgeLabel(pr.created_at)}</span>
          </div>
        </div>
      </div>

      {/* Description / body */}
      {bodyText && (
        <div className="border-b border-border-subtle px-4 py-3">
          <span className="mb-2 block text-xs font-medium text-primary">Description</span>
          <div className="text-xs leading-relaxed text-secondary">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]} 
              rehypePlugins={[rehypeRaw]}
              components={compactMdComponents}
            >
              {displayBody ?? ''}
            </ReactMarkdown>
          </div>
          {isLongBody && (
            <button
              onClick={() => setShowFullBody((v) => !v)}
              className="mt-1.5 flex items-center gap-1 text-2xs text-accent-primary hover:underline"
            >
              {showFullBody ? (
                <>
                  <ChevronUp className="size-3" /> Show less
                </>
              ) : (
                <>
                  <ChevronDown className="size-3" /> Show more
                </>
              )}
            </button>
          )}
        </div>
      )}



      {/* Merge/close status */}
      {(pr.merged || pr.state === 'closed') && (
        <div className="px-4 py-3">
          {pr.merged ? (
            <div className="flex items-center gap-2 rounded-md bg-semantic-merged-muted px-3 py-2">
              <GitMerge className="size-4 text-semantic-merged" />
              <span className="text-xs font-medium text-semantic-merged">
                Merged {toAgeLabel(pr.updated_at)}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md bg-semantic-error-muted px-3 py-2">
              <XCircle className="size-4 text-semantic-error" />
              <span className="text-xs font-medium text-semantic-error">
                Closed {toAgeLabel(pr.updated_at)}
              </span>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
