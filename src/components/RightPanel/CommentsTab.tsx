import { useState } from "react";
import { Loader, MessageSquare, Copy, Check, X, CheckCircle2, Code2, ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { markdownComponents as sharedMarkdownComponents } from "../../lib/markdown-components";
import { useCachedPRData } from "../../hooks/useCachedPRData";
import { cn } from "../../utils/cn";
import type { PRStatus, PRComment } from "../../types/github";

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

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const bgColor = stringToColor(name);
  const initials = getInitials(name);
  const sizeClasses = size === 'sm' ? 'w-5 h-5 text-[8px]' : 'w-6 h-6 text-[9px]';
  
  return (
    <div
      className={`${sizeClasses} rounded-full flex items-center justify-center font-medium text-white shrink-0`}
      style={{ background: bgColor }}
    >
      {initials}
    </div>
  );
}

export function CommentsTab({
  repoPath,
  prNumber,
  prStatus,
  children,
}: CommentsTabProps) {
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null);
  const { prDetails, isLoading, error, fetchData } = useCachedPRData({ repoPath, prNumber, prStatus });

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
    img: ({ src, alt }: { src?: string; alt?: string }) => (
      <img
        src={src}
        alt={alt || ""}
        className="my-3 max-w-full cursor-pointer rounded-md border border-border-subtle transition-opacity hover:opacity-90"
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

  const getCommentKey = (comment: PRComment) => (
    `${comment.review_id ?? 'thread'}:${comment.created_at}:${comment.author}:${comment.path ?? ''}:${comment.line ?? 0}`
  );
  
  const commentsByFile = new Map<string, PRComment[]>();
  for (const comment of threadComments) {
    const path = comment.path || 'General';
    const existing = commentsByFile.get(path) || [];
    existing.push(comment);
    commentsByFile.set(path, existing);
  }

  const sortedFiles = Array.from(commentsByFile.keys()).sort();
  const description = prDetails?.body?.replace(/<!--[\s\S]*?-->/g, '').trim();
  const activityCount = issueComments.length + reviews.length + threadComments.length;

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
    
    sortedFiles.forEach(file => {
      allText += `# File: ${file}\n\n`;
      const fileComments = commentsByFile.get(file) || [];
      fileComments.sort((a, b) => (a.line || 0) - (b.line || 0));
      fileComments.forEach(comment => {
         allText += `> ${comment.author} (Line ${comment.line || '?'})${comment.is_resolved ? ' [RESOLVED]' : ''}: ${comment.body}\n\n`;
      });
    });
    
    await navigator.clipboard.writeText(allText);
  };

  const handleCopyFileComments = async (file: string, fileComments: PRComment[]) => {
      let text = `# File: ${file}\n\n`;
      fileComments.forEach(comment => {
         text += `> ${comment.author} (Line ${comment.line || '?'})${comment.is_resolved ? ' [RESOLVED]' : ''}: ${comment.body}\n\n`;
      });
      await navigator.clipboard.writeText(text);
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
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tertiary">
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

            {(prStatus.review_decision || prStatus.requested_reviewers.length > 0) && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-tertiary">
                {prStatus.review_decision && (
                  <span className="rounded-md bg-secondary px-2 py-0.5 text-secondary">
                    {prStatus.review_decision === "APPROVED"
                      ? "Approved"
                      : prStatus.review_decision === "CHANGES_REQUESTED"
                        ? "Changes requested"
                        : "Review required"}
                  </span>
                )}
                {prStatus.requested_reviewers.map((reviewer) => (
                  <span key={reviewer} className="rounded-md border border-border-subtle px-2 py-0.5">
                    Review requested from {reviewer}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-5">
              <h2 className="sr-only">Description</h2>
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
            </div>
          </header>
        )}

        {children}

        <section aria-labelledby="pr-activity-heading" className="border-t border-border-subtle">
          <div className="flex min-h-14 items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h2 id="pr-activity-heading" className="text-sm font-semibold text-primary">Activity</h2>
                {activityCount > 0 && <span className="font-mono text-[11px] tabular-nums text-tertiary">{activityCount}</span>}
              </div>
              <p className="mt-0.5 text-xs text-tertiary">Conversation and review threads</p>
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

        {issueComments.length > 0 && (
          <div className="divide-y divide-border-subtle border-t border-border-subtle">
            {issueComments.map((comment) => (
              <CommentRow
                key={getCommentKey(comment)}
                comment={comment}
                renderBody={renderCommentBody}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}

        {reviews.length > 0 && (
           <div className="divide-y divide-border-subtle border-t border-border-subtle">
             {reviews.map((review) => (
               <div key={getCommentKey(review)} className="group relative flex items-start gap-3 px-5 py-4">
                 <Avatar name={review.author} />
                 <div className="flex-1 min-w-0">
                   <div className="mb-1 flex flex-wrap items-center gap-2">
                     <span className="text-[13px] font-medium text-primary">{review.author}</span>
                     <span className={cn(
                       "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                       review.state === 'APPROVED'
                         ? "bg-semantic-success-muted text-semantic-success"
                         : review.state === 'CHANGES_REQUESTED'
                           ? "bg-semantic-error-muted text-semantic-error"
                           : "bg-secondary text-secondary"
                     )}>
                       {review.state === 'APPROVED'
                         ? 'Approved'
                         : review.state === 'CHANGES_REQUESTED'
                           ? 'Requested Changes'
                           : 'Commented'}
                     </span>
                     {formatDate(review.created_at) && (
                       <span className="text-[11px] text-tertiary">{formatDate(review.created_at)}</span>
                     )}
                     <div className="ml-auto opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <CopyButton text={`Review by ${review.author} (${review.state}):\n${review.body}`} className="bg-transparent hover:bg-hover" title="Copy review" />
                     </div>
                   </div>
                   {review.body && (
                     <div className="mt-2 text-[13px] text-secondary">
                       {renderCommentBody(review.body)}
                     </div>
                   )}
                 </div>
               </div>
             ))}
           </div>
        )}

        <div>
          {sortedFiles.map(filePath => {
            const fileComments = commentsByFile.get(filePath) || [];
            fileComments.sort((a, b) => (a.line || 0) - (b.line || 0));

            return (
              <div key={filePath} className="group/file bg-primary">
                <div className="flex min-h-9 items-center justify-between gap-2 border-y border-border-subtle bg-secondary/50 px-5 py-2">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Code2 className="h-3.5 w-3.5 shrink-0 text-tertiary" />
                    <span className="truncate font-mono text-[11px] text-secondary" title={filePath}>{filePath}</span>
                  </div>
                  <button 
                    onClick={() => handleCopyFileComments(filePath, fileComments)}
                    className="rounded p-1.5 text-tertiary opacity-0 transition-[background-color,opacity] duration-150 hover:bg-hover hover:text-primary group-hover/file:opacity-100 group-focus-within/file:opacity-100"
                    title="Copy file comments"
                    aria-label={`Copy comments for ${filePath}`}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                
                <div className="divide-y divide-border/50">
                  {fileComments.map((comment) => (
                    <CommentRow 
                        key={getCommentKey(comment)} 
                        comment={comment} 
                        isResolved={comment.is_resolved}
                        renderBody={renderCommentBody}
                        formatDate={formatDate}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          
          {!isLoading && !error && sortedFiles.length === 0 && reviews.length === 0 && issueComments.length === 0 && (
             <div className="flex flex-col items-center justify-center py-12 text-tertiary">
               <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
               <p className="text-sm">No activity yet</p>
             </div>
          )}
        </div>
        </section>
      </div>
    </>
  );
}

function CommentRow({ comment, isResolved, renderBody, formatDate }: { 
    comment: PRComment; 
    isResolved?: boolean;
    renderBody: (body: string) => React.ReactNode;
    formatDate: (date: string) => string;
}) {
    const [isExpanded, setIsExpanded] = useState(!isResolved);
    const formattedDate = formatDate(comment.created_at);

    if (isResolved && !isExpanded) {
        return (
            <button
                type="button"
                className="group flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-hover/40 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px]"
                onClick={() => setIsExpanded(true)}
            >
                <div className="flex w-6 justify-center">
                    <CheckCircle2 className="h-3.5 w-3.5 text-tertiary" />
                </div>
                <div className="flex-1 flex items-center gap-2 overflow-hidden">
                    <span className="text-xs font-medium text-tertiary">Resolved by {comment.author}</span>
                    <span className="truncate text-xs text-muted">{comment.body.substring(0, 50)}…</span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 -rotate-90 text-tertiary" />
            </button>
        );
    }

    return (
        <div className={cn("group/comment relative px-5 py-4 transition-colors hover:bg-hover/20", isResolved && "bg-secondary/10")}>
            <div className="flex items-start gap-3">
                <Avatar name={comment.author} />
                <div className="flex-1 min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                        <span className="text-[13px] font-medium text-primary">{comment.author}</span>
                        {formattedDate && <span className="text-[11px] text-tertiary">{formattedDate}</span>}
                        <div className="ml-auto flex items-center gap-2">
                            {comment.line && (
                                <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-tertiary">
                                    Line {comment.line}
                                </span>
                            )}
                            {isResolved && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
                                    className="rounded p-1 text-tertiary transition-colors hover:bg-hover hover:text-primary"
                                    title="Collapse resolved"
                                    aria-label="Collapse resolved comment"
                                >
                                    <CheckCircle2 className="w-4 h-4 text-semantic-success" />
                                </button>
                            )}
                            <div className="opacity-0 transition-opacity group-hover/comment:opacity-100 group-focus-within/comment:opacity-100">
                                <CopyButton text={comment.body} className="bg-transparent hover:bg-hover p-1" title="Copy comment" />
                            </div>
                        </div>
                    </div>
                    <div className="text-[13px] text-secondary">
                        {renderBody(comment.body)}
                    </div>
                </div>
            </div>
        </div>
    );
}
