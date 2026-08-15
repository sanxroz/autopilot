import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader, MessageSquare, Copy, Check, X, CheckCircle2, Code2, ChevronDown, UserPlus, GitPullRequest, Users } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { markdownComponents as sharedMarkdownComponents } from "../../lib/markdown-components";
import { useCachedPRData } from "../../hooks/useCachedPRData";
import { cn } from "../../utils/cn";
import type { PRStatus, PRComment } from "../../types/github";
import { groupReviewThreads, type PRReviewThread } from "./pr-activity";
import {
  applyReviewerOverrides,
  buildReviewerOptions,
  clearAcknowledgedReviewerOverrides,
  fallbackReviewerCandidate,
  type ReviewerCandidate,
  type ReviewerOverrides,
} from "./reviewer-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

function getInitials(name: string): string {
  const parts = name.split(/[\s-_]+/).filter(p => p.length > 0);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  if (parts.length === 1 && parts[0].length >= 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return '??';
}

interface CommentsTabProps {
  repoPath: string | null;
  prNumber: number | null;
  prStatus: PRStatus | null;
  children?: React.ReactNode;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (!Number.isFinite(date.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function CopyButton({ text, className, title = "Copy code" }: { text: string; className?: string; title?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "rounded p-1.5 transition-[background-color,color,transform] duration-150 active:scale-95",
        "hover:bg-hover text-tertiary hover:text-primary",
        className
      )}
      title={title}
      aria-label={copied ? "Copied" : title}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-semantic-success" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

function ImageModal({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Image: ${alt}`}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-secondary"
        aria-label="Close image"
      >
        <X className="w-5 h-5 text-primary" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function GithubAvatar({ name, avatarUrl, isTeam = false }: { name: string; avatarUrl?: string; isTeam?: boolean }) {
  const [failed, setFailed] = useState(false);
  const imageSrc = avatarUrl || (!isTeam ? `https://github.com/${name}.png?size=40` : undefined);

  useEffect(() => setFailed(false), [name, avatarUrl]);

  return (
    <div className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tertiary text-[8px] font-medium text-secondary">
      {failed || !imageSrc ? (
        isTeam ? <Users className="size-3" /> : getInitials(name)
      ) : (
        <img
          src={imageSrc}
          alt=""
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

function ReviewerPicker({
  repoPath,
  prNumber,
  author,
  requestedReviewers,
  reviewStates,
  onRequestedReviewerChange,
}: {
  repoPath: string | null;
  prNumber: number;
  author: string;
  requestedReviewers: string[];
  reviewStates: ReadonlyMap<string, string | undefined>;
  onRequestedReviewerChange: (reviewer: string, requested: boolean) => void;
}) {
  const [candidates, setCandidates] = useState<ReviewerCandidate[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [busyReviewer, setBusyReviewer] = useState<string | null>(null);
  const currentReviewers = [...new Set([...requestedReviewers, ...reviewStates.keys()])];
  const candidatesByIdentifier = new Map(
    candidates?.map((candidate) => [candidate.identifier.toLowerCase(), candidate]),
  );
  const candidateFor = (reviewer: string) => (
    candidatesByIdentifier.get(reviewer.toLowerCase()) ?? fallbackReviewerCandidate(reviewer)
  );
  const options = buildReviewerOptions(candidates ?? [], currentReviewers, requestedReviewers, author);

  const loadCandidates = async (open: boolean) => {
    if (!open || (candidates !== null && !loadError) || isLoading || !repoPath) return;
    setIsLoading(true);
    setLoadError(false);
    try {
      setCandidates(await invoke<ReviewerCandidate[]>('get_pr_reviewer_candidates', { repoPath }));
    } catch {
      setCandidates([]);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleReviewer = async (reviewer: string) => {
    if (!repoPath || busyReviewer) return;
    const isRequested = requestedReviewers.includes(reviewer);
    if (isRequested && !window.confirm(`Remove @${reviewer} from this pull request?`)) return;

    setBusyReviewer(reviewer);
    try {
      await invoke(isRequested ? 'remove_pr_reviewer' : 'rerequest_pr_review', { repoPath, prNumber, reviewer });
      onRequestedReviewerChange(reviewer, !isRequested);
      toast.success(isRequested ? `Removed @${reviewer}` : `Requested review from @${reviewer}`);
    } catch (reviewerError) {
      toast.error(`Couldn’t ${isRequested ? 'remove' : 'add'} @${reviewer}: ${String(reviewerError)}`);
    } finally {
      setBusyReviewer(null);
    }
  };

  return (
    <DropdownMenu onOpenChange={(open) => void loadCandidates(open)}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex h-7 shrink-0 items-center rounded-md px-1.5 text-tertiary transition-colors after:absolute after:-inset-2 hover:bg-hover hover:text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2"
          aria-label="Manage pull request reviewers"
        >
          {currentReviewers.length > 0 ? (
            <span className="flex -space-x-1.5">
              {currentReviewers.slice(0, 3).map((reviewer) => {
                const candidate = candidateFor(reviewer);
                return (
                  <span key={reviewer} className="rounded-full ring-2 ring-bg-primary">
                    <GithubAvatar
                      name={candidate.display_name}
                      avatarUrl={candidate.avatar_url}
                      isTeam={candidate.kind === "team"}
                    />
                  </span>
                );
              })}
            </span>
          ) : (
            <UserPlus className="size-3.5" />
          )}
          {currentReviewers.length > 3 && <span className="ml-1 text-[10px]">+{currentReviewers.length - 3}</span>}
          <ChevronDown className="ml-1 size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-72 w-64 overflow-y-auto border-border-subtle bg-secondary text-white shadow-xl dark:text-white motion-reduce:animate-none"
      >
        <div className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">Reviewers</div>
        {isLoading && (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-neutral-400">
            <Loader className="size-3.5 animate-spin" />
            Loading…
          </div>
        )}
        {!isLoading && options.map((candidate) => {
          const reviewer = candidate.identifier;
          const isRequested = requestedReviewers.includes(reviewer);
          const reviewState = candidate.kind === "user" ? reviewStates.get(reviewer) : undefined;
          const status = isRequested
            ? "Requested"
            : reviewState === 'APPROVED'
              ? "Approved"
              : reviewState === 'CHANGES_REQUESTED'
                ? "Changes requested"
                : null;

          return (
            <DropdownMenuItem
              key={candidate.identifier}
              disabled={busyReviewer !== null}
              onSelect={() => void toggleReviewer(reviewer)}
              className="px-2 py-2 text-xs focus:bg-neutral-800 focus:text-white dark:focus:bg-neutral-800 dark:focus:text-white"
            >
              <GithubAvatar
                name={candidate.display_name}
                avatarUrl={candidate.avatar_url}
                isTeam={candidate.kind === "team"}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{candidate.display_name}</span>
                {candidate.kind === "team" && (
                  <span className="block truncate text-[10px] text-neutral-400">{candidate.identifier} · Team</span>
                )}
              </span>
              {status && <span className="shrink-0 text-[10px] text-neutral-400">{status}</span>}
              {busyReviewer === reviewer
                ? <Loader className="size-3.5 animate-spin text-neutral-400" />
                : isRequested && <Check className="size-3.5 text-semantic-success" />}
            </DropdownMenuItem>
          );
        })}
        {!isLoading && options.length === 0 && (
          <div className="px-2 py-3 text-xs text-neutral-400">
            {loadError ? "Couldn’t load repository collaborators." : "No reviewers available."}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CommentsTab({
  repoPath,
  prNumber,
  prStatus,
  children,
}: CommentsTabProps) {
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [reviewerOverrides, setReviewerOverrides] = useState<{
    prNumber: number;
    values: ReviewerOverrides;
  } | null>(null);
  const { prDetails, isLoading, error, fetchData } = useCachedPRData({ repoPath, prNumber, prStatus });

  useEffect(() => {
    if (!prStatus) return;
    setReviewerOverrides((current) => {
      if (!current || current.prNumber !== prStatus.number) return current;
      const values = clearAcknowledgedReviewerOverrides(current.values, prStatus.requested_reviewers);
      return Object.keys(values).length > 0 ? { ...current, values } : null;
    });
  }, [prStatus]);

  const activeReviewerOverrides = reviewerOverrides?.prNumber === prStatus?.number
    ? reviewerOverrides.values
    : {};
  const reviewers = applyReviewerOverrides(
    prStatus?.requested_reviewers ?? [],
    activeReviewerOverrides,
  );

  const handleRequestedReviewerChange = (reviewer: string, requested: boolean) => {
    if (!prStatus) return;
    setReviewerOverrides((current) => ({
      prNumber: prStatus.number,
      values: {
        ...(current?.prNumber === prStatus.number ? current.values : {}),
        [reviewer.toLowerCase()]: { reviewer, requested },
      },
    }));
  };

  const markdownComponents = {
    ...sharedMarkdownComponents,
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h1 className="mb-2 mt-4 text-sm font-semibold leading-5 text-primary first:mt-0">{children}</h1>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h2 className="mb-2 mt-4 border-0 p-0 text-[13px] font-semibold leading-5 text-primary first:mt-0">{children}</h2>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3 className="mb-1.5 mt-3 text-[13px] font-medium leading-5 text-primary first:mt-0">{children}</h3>
    ),
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="my-2 leading-5 text-secondary first:mt-0 last:mb-0">{children}</p>
    ),
    img: ({ src, alt, width, height }: React.ImgHTMLAttributes<HTMLImageElement>) => (
      <img
        src={src}
        alt={alt || ""}
        width={width}
        height={height}
        className={cn(
          "h-auto max-w-full cursor-pointer rounded-md border border-border-subtle transition-opacity hover:opacity-90",
          width && height ? "my-2 inline-block" : "my-3 block",
        )}
        onClick={() => src && setExpandedImage({ src, alt: alt || "" })}
      />
    ),
    pre: ({ children }: { children?: React.ReactNode }) => {
      const codeContent = (() => {
        try {
          const child = children as React.ReactElement<{ children?: React.ReactNode }>;
          if (child?.props?.children) {
            return String(child.props.children);
          }
        } catch {
          // ignore
        }
        return "";
      })();
      return (
        <div className="group relative my-3">
          <pre className="overflow-x-auto rounded-md border border-border-subtle bg-secondary p-3 text-xs leading-5">
            {children}
          </pre>
          <CopyButton text={codeContent} className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" />
        </div>
      );
    },
  };

  const renderCommentBody = (body: string) => (
    <div className="text-[13px] leading-relaxed text-primary">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={markdownComponents}
      >
        {body.replace(/<!--[\s\S]*?-->/g, '')}
      </ReactMarkdown>
    </div>
  );

  if (!prNumber) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-tertiary">
        No PR found for this branch
      </div>
    );
  }

  const comments = prDetails?.comments || [];
  const issueComments = comments.filter(c => c.comment_type === 'issue');

  const reviews = comments.filter(
    (c) => c.comment_type === 'review' && (
      c.state === 'APPROVED' ||
      c.state === 'CHANGES_REQUESTED' ||
      c.state === 'COMMENTED'
    )
  );
  const threadComments = comments.filter(c => c.comment_type === 'review_thread');
  const reviewThreads = groupReviewThreads(threadComments);
  const reviewerReviewStates = new Map(
    reviews
      .filter((review) => review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED')
      .map((review) => [review.author, review.state]),
  );

  const getCommentKey = (comment: PRComment) => (
    `${comment.review_id ?? 'thread'}:${comment.created_at}:${comment.author}:${comment.path ?? ''}:${comment.line ?? 0}`
  );
  
  const description = prDetails?.body?.replace(/<!--[\s\S]*?-->/g, '').trim();
  const activityCount = issueComments.length + reviews.length + threadComments.length;

  const activity = [
    ...issueComments.map((comment) => ({ kind: 'comment' as const, createdAt: comment.created_at, comment })),
    ...reviews.map((comment) => ({ kind: 'review' as const, createdAt: comment.created_at, comment })),
    ...reviewThreads.map((thread) => ({ kind: 'thread' as const, createdAt: thread.createdAt, thread })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const handleCopyAll = async () => {
    let allText = "";
    if (issueComments.length > 0) {
      allText += "# Conversation\n\n";
      issueComments.forEach(comment => {
        allText += `## ${comment.author}\n${comment.body}\n\n`;
      });
    }
    if (reviews.length > 0) {
      allText += "# Reviews\n\n";
      reviews.forEach(review => {
         allText += `## ${review.author} (${review.state})\n${review.body}\n\n`;
      });
    }
    
    reviewThreads.forEach(thread => {
      allText += `# Thread: ${thread.path}${thread.line ? ` (Line ${thread.line})` : ''}\n\n`;
      thread.comments.forEach(comment => {
         allText += `> ${comment.author}${thread.isResolved ? ' [RESOLVED]' : ''}: ${comment.body}\n\n`;
      });
    });
    
    await navigator.clipboard.writeText(allText);
  };

  return (
    <>
      {expandedImage && (
        <ImageModal
          src={expandedImage.src}
          alt={expandedImage.alt}
          onClose={() => setExpandedImage(null)}
        />
      )}
      <div className="flex h-full flex-col overflow-auto bg-primary">
        {prStatus && (
          <header className="px-5 pb-5 pt-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tertiary">
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    prStatus.merged
                      ? "bg-semantic-merged"
                      : prStatus.draft
                        ? "bg-border-strong"
                        : prStatus.state === "open"
                          ? "bg-semantic-success"
                          : "bg-border-strong",
                  )}
                  aria-hidden="true"
                />
                <span className="font-medium text-secondary">
                  {prStatus.merged ? "Merged" : prStatus.draft ? "Draft" : prStatus.state === "open" ? "Open" : "Closed"}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">#{prStatus.number}</span>
                <span aria-hidden="true">·</span>
                <span>{prStatus.author}</span>
                <span aria-hidden="true">·</span>
                <span>{formatDate(prStatus.created_at)}</span>
              </div>
              {prStatus.state === "open" && !prStatus.merged && (
                <ReviewerPicker
                  repoPath={repoPath}
                  prNumber={prStatus.number}
                  author={prStatus.author}
                  requestedReviewers={reviewers}
                  reviewStates={reviewerReviewStates}
                  onRequestedReviewerChange={handleRequestedReviewerChange}
                />
              )}
            </div>

            <h1 className="mt-3 text-pretty text-[17px] font-semibold leading-6 tracking-[-0.018em] text-primary">
              {prStatus.title}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px] text-tertiary">
              <span className="max-w-full truncate rounded-md bg-secondary px-2 py-1 font-mono text-secondary">
                {prStatus.head_branch} → {prStatus.base_branch}
              </span>
              <span className="font-mono tabular-nums text-semantic-success">+{prStatus.additions}</span>
              <span className="font-mono tabular-nums text-semantic-error">−{prStatus.deletions}</span>
            </div>

            {prStatus.labels.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Pull request labels">
                {prStatus.labels.map((label) => (
                  <span key={label} className="rounded-md border border-border-subtle px-2 py-0.5 text-[11px] text-tertiary">
                    {label}
                  </span>
                ))}
              </div>
            )}

            <section className="mt-2">
              <button
                type="button"
                onClick={() => setIsDescriptionOpen((open) => !open)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md text-left text-xs font-medium text-secondary focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2"
                aria-expanded={isDescriptionOpen}
                aria-controls="pr-description"
              >
                <span>Description</span>
                <ChevronDown className={cn("h-4 w-4 text-tertiary transition-transform motion-reduce:transition-none", isDescriptionOpen && "rotate-180")} />
              </button>
              {isDescriptionOpen && <div id="pr-description" className="pb-1 pt-2">
              {isLoading && !prDetails ? (
                <div className="space-y-2" aria-label="Loading pull request description">
                  <div className="h-3 w-full rounded bg-hover" />
                  <div className="h-3 w-5/6 rounded bg-hover" />
                  <div className="h-3 w-2/3 rounded bg-hover" />
                </div>
              ) : error ? (
                <div className="rounded-md border border-semantic-error/30 bg-semantic-error-muted p-3 text-xs text-semantic-error">
                  <p>Couldn’t load the pull request description.</p>
                  <button type="button" onClick={() => fetchData()} className="mt-2 font-medium underline underline-offset-2">
                    Try again
                  </button>
                </div>
              ) : description ? (
                <article className="text-[13px] leading-5 text-primary select-text">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw, rehypeSanitize]}
                    components={markdownComponents}
                  >
                    {description}
                  </ReactMarkdown>
                </article>
              ) : (
                <p className="text-sm text-tertiary">No description provided.</p>
              )}
              </div>}
            </section>
          </header>
        )}

        {children}

        <section aria-labelledby="pr-activity-heading" className="pt-2">
          <div className="flex h-12 items-center justify-between gap-3 px-5">
            <div className="flex min-w-0 items-baseline gap-2">
              <h2 id="pr-activity-heading" className="text-sm font-semibold text-primary">Activity</h2>
              {activityCount > 0 && <span className="font-mono text-[11px] tabular-nums text-tertiary">{activityCount}</span>}
            </div>
            {activityCount > 0 && (
              <button
                type="button"
                onClick={handleCopyAll}
                className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] text-tertiary transition-colors hover:bg-hover hover:text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2"
              >
                <Copy className="h-3 w-3" />
                Copy all
              </button>
            )}
          </div>

        {isLoading && !prDetails && (
          <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-tertiary">
            <Loader className="h-4 w-4 animate-spin" />
            <span>Loading activity…</span>
          </div>
        )}

        {error && !prDetails && (
          <p className="px-4 py-8 text-center text-sm text-tertiary">
            Activity couldn’t be loaded.
          </p>
        )}

        {(prStatus || activity.length > 0) && (
          <div className="select-text px-5 pb-4 pt-1">
            {prStatus && (
              <div className="flex items-center gap-2.5 py-3 text-[11px] text-tertiary">
                <GitPullRequest className={cn(
                  "size-4 shrink-0",
                  prStatus.merged ? "text-semantic-merged" : prStatus.state === "open" ? "text-semantic-success" : "text-tertiary",
                )} />
                <span>
                  Opened by <span className="font-medium text-secondary">{prStatus.author}</span>{formatDate(prStatus.created_at) && ` ${formatDate(prStatus.created_at)}`}
                </span>
              </div>
            )}
            {activity.map((item) => {
              if (item.kind === 'comment') {
                return <CommentRow key={getCommentKey(item.comment)} comment={item.comment} renderBody={renderCommentBody} formatDate={formatDate} />;
              }

              if (item.kind === 'thread') {
                return <ReviewThreadRow key={item.thread.id} thread={item.thread} renderBody={renderCommentBody} formatDate={formatDate} />;
              }

              const review = item.comment;
              return (
                <div key={getCommentKey(review)} className="group flex items-start gap-2.5 py-3">
                  <GithubAvatar name={review.author} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                      <span className="text-[13px] font-medium text-primary">{review.author}</span>
                      <span className={cn(
                        "text-[11px]",
                        review.state === 'APPROVED'
                          ? "text-semantic-success"
                          : review.state === 'CHANGES_REQUESTED'
                            ? "text-semantic-error"
                            : "text-tertiary"
                      )}>
                        {review.state === 'APPROVED' ? 'approved these changes' : review.state === 'CHANGES_REQUESTED' ? 'requested changes' : 'reviewed'}
                      </span>
                      {formatDate(review.created_at) && <span className="text-[11px] text-tertiary">{formatDate(review.created_at)}</span>}
                      <div className="ml-auto opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <CopyButton text={`Review by ${review.author} (${review.state}):\n${review.body}`} className="bg-transparent hover:bg-hover" title="Copy review" />
                      </div>
                    </div>
                    {review.body && <div className="mt-2 rounded-lg bg-secondary/40 p-3">{renderCommentBody(review.body)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isLoading && !error && !prStatus && activity.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-tertiary">
            <MessageSquare className="mb-2 h-8 w-8 opacity-50" />
            <p className="text-sm">No activity yet</p>
          </div>
        )}
        </section>
      </div>
    </>
  );
}

function ReviewThreadRow({ thread, renderBody, formatDate }: {
  thread: PRReviewThread;
  renderBody: (body: string) => React.ReactNode;
  formatDate: (date: string) => string;
}) {
  const [isExpanded, setIsExpanded] = useState(!thread.isResolved);
  const [rootComment, ...replies] = thread.comments;

  if (!rootComment) return null;

  if (thread.isResolved && !isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className="mb-3 flex min-h-12 w-full items-center gap-2.5 rounded-lg bg-secondary/40 px-3 py-2.5 text-left transition-colors hover:bg-secondary/60 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2"
      >
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary">
          <CheckCircle2 className="size-3.5 text-semantic-success" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-mono text-[11px] text-secondary">{thread.path}{thread.line ? ` · Line ${thread.line}` : ''}</span>
            <span className="shrink-0 text-[10px] text-tertiary">resolved</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-tertiary">{rootComment.body}</span>
        </span>
        <ChevronDown className="mt-1 size-3.5 -rotate-90 text-tertiary" />
      </button>
    );
  }

  return (
    <article className="mb-3 rounded-lg bg-secondary/40 p-3" aria-label={`Review thread on ${thread.path}`}>
      <div className="flex items-start gap-2.5">
        <GithubAvatar name={rootComment.author} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span className="text-[13px] font-medium text-primary">{rootComment.author}</span>
            {formatDate(rootComment.created_at) && <span className="text-[11px] text-tertiary">{formatDate(rootComment.created_at)}</span>}
            {thread.isResolved && (
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="ml-auto inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-semantic-success transition-colors hover:bg-hover focus-visible:outline focus-visible:outline-1"
                aria-label="Collapse resolved review thread"
              >
                <CheckCircle2 className="size-3" />
                Resolved
              </button>
            )}
          </div>
          <div className="mt-1 flex max-w-full items-center gap-1.5 text-tertiary">
            <Code2 className="size-3 shrink-0" />
            <span className="truncate font-mono text-[10px]" title={thread.path}>{thread.path}</span>
            {thread.line && <span className="shrink-0 font-mono text-[10px]">:{thread.line}</span>}
          </div>
        </div>
      </div>
      <div className="mt-2 text-[13px] text-secondary">{renderBody(rootComment.body)}</div>

      {replies.length > 0 && (
        <div className="mt-4 space-y-4">
          {replies.map((comment, index) => (
            <div key={`${comment.author}:${comment.created_at}:${index}`} className="flex items-start gap-2.5">
              <GithubAvatar name={comment.author} />
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-baseline gap-1.5">
                  <span className="text-[12px] font-medium text-primary">{comment.author}</span>
                  {formatDate(comment.created_at) && <span className="text-[10px] text-tertiary">{formatDate(comment.created_at)}</span>}
                </div>
                <div className="text-[13px] text-secondary">{renderBody(comment.body)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function CommentRow({ comment, renderBody, formatDate }: {
  comment: PRComment;
  renderBody: (body: string) => React.ReactNode;
  formatDate: (date: string) => string;
}) {
  const formattedDate = formatDate(comment.created_at);

  return (
    <article className="group/comment mb-3 rounded-lg bg-secondary/40 p-3">
      <div className="flex items-center gap-2.5">
        <GithubAvatar name={comment.author} />
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="text-[13px] font-medium text-primary">{comment.author}</span>
          {formattedDate && <span className="text-[11px] text-tertiary">{formattedDate}</span>}
          <div className="ml-auto opacity-0 transition-opacity group-hover/comment:opacity-100 group-focus-within/comment:opacity-100">
            <CopyButton text={comment.body} className="bg-transparent p-1 hover:bg-hover" title="Copy comment" />
          </div>
        </div>
      </div>
      <div className="mt-2 text-[13px] text-secondary">{renderBody(comment.body)}</div>
    </article>
  );
}
