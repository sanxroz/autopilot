import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader, MessageSquare, Copy, Check, X, CheckCircle2, XCircle, Code2, ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { useTheme } from "../../hooks/useTheme";
import type { PRDetailedInfo, PRStatus, PRComment } from "../../types/github";

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
  const parts = name.split(/[\s-_]+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

interface CommentsTabProps {
  repoPath: string | null;
  prNumber: number | null;
  prStatus: PRStatus | null;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const theme = useTheme();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
      style={{ background: theme.bg.hover }}
      title="Copy code"
    >
      {copied ? (
        <Check className="w-3 h-3" style={{ color: theme.semantic.success }} />
      ) : (
        <Copy className="w-3 h-3" style={{ color: theme.text.tertiary }} />
      )}
    </button>
  );
}

function ImageModal({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const theme = useTheme();

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full"
        style={{ background: theme.bg.secondary }}
      >
        <X className="w-5 h-5" style={{ color: theme.text.primary }} />
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

export function CommentsTab({ repoPath, prNumber, prStatus }: CommentsTabProps) {
  const theme = useTheme();
  const [prDetails, setPrDetails] = useState<PRDetailedInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null);
  const [collapsedReviews, setCollapsedReviews] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    if (!repoPath || !prNumber) {
      setPrDetails(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const details = await invoke<PRDetailedInfo>("get_pr_details", { repoPath, prNumber });
      setPrDetails(details);
    } catch (e) {
      setError(String(e));
      setPrDetails(null);
    } finally {
      setIsLoading(false);
    }
  }, [repoPath, prNumber]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (prStatus) {
      fetchData();
    }
  }, [prStatus, fetchData]);

  const toggleReviewCollapse = (reviewId: string) => {
    setCollapsedReviews(prev => {
      const next = new Set(prev);
      if (next.has(reviewId)) {
        next.delete(reviewId);
      } else {
        next.add(reviewId);
      }
      return next;
    });
  };

  if (!prNumber) {
    return (
      <div
        className="flex-1 flex items-center justify-center text-sm"
        style={{ color: theme.text.tertiary }}
      >
        No PR found for this branch
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="flex-1 flex items-center justify-center gap-2 text-sm"
        style={{ color: theme.text.tertiary }}
      >
        <Loader className="w-4 h-4 animate-spin" />
        <span>Loading comments...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center gap-3 p-6"
      >
        <span className="text-sm text-center" style={{ color: theme.text.tertiary }}>{error}</span>
        <button
          onClick={fetchData}
          className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
          style={{ 
            background: theme.bg.tertiary, 
            color: theme.text.secondary,
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = theme.bg.hover}
          onMouseLeave={(e) => e.currentTarget.style.background = theme.bg.tertiary}
        >
          Try again
        </button>
      </div>
    );
  }

  const comments = prDetails?.comments || [];

  console.log('[CommentsTab] Total comments received:', comments.length);
  console.log('[CommentsTab] Comment breakdown:', {
    issue: comments.filter(c => c.comment_type === 'issue').length,
    review: comments.filter(c => c.comment_type === 'review').length,
    review_thread: comments.filter(c => c.comment_type === 'review_thread').length,
  });

  const threadsByReviewId = new Map<string, PRComment[]>();
  const topLevelComments: PRComment[] = [];
  
  for (const comment of comments) {
    if (comment.comment_type === 'review_thread' && comment.review_id) {
      console.log('[CommentsTab] Found review thread:', {
        author: comment.author,
        review_id: comment.review_id,
        path: comment.path,
        line: comment.line
      });
      const existing = threadsByReviewId.get(comment.review_id) || [];
      existing.push(comment);
      threadsByReviewId.set(comment.review_id, existing);
    } else {
      topLevelComments.push(comment);
      if (comment.comment_type === 'review') {
        console.log('[CommentsTab] Found review:', {
          author: comment.author,
          state: comment.state,
          review_id: comment.review_id,
          body_length: comment.body?.length || 0
        });
      }
    }
  }
  
  console.log('[CommentsTab] Threads by review ID:', Array.from(threadsByReviewId.entries()).map(([id, threads]) => ({
    review_id: id,
    thread_count: threads.length
  })));
  console.log('[CommentsTab] Top level comments:', topLevelComments.length);
  
  console.log('[CommentsTab] Review IDs in top-level comments:', 
    topLevelComments
      .filter(c => c.comment_type === 'review')
      .map(c => c.review_id)
  );
  
  topLevelComments.sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const markdownComponents = {
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <a 
        href={href} 
        target="_blank" 
        rel="noopener noreferrer"
        style={{ color: theme.semantic.info }}
        className="hover:underline"
      >
        {children}
      </a>
    ),
    code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
      const isInline = !className;
      return isInline ? (
        <code 
          className="px-1 py-0.5 rounded text-[13px]"
          style={{ background: theme.bg.tertiary, color: theme.text.primary }}
          {...props}
        >
          {children}
        </code>
      ) : (
        <code className={className} {...props}>{children}</code>
      );
    },
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
        <div className="relative group my-2">
          <pre 
            className="p-3 rounded text-[13px] overflow-x-auto"
            style={{ background: theme.bg.tertiary }}
          >
            {children}
          </pre>
          <CopyButton text={codeContent} />
        </div>
      );
    },
    img: ({ src, alt }: { src?: string; alt?: string }) => (
      <img
        src={src}
        alt={alt || ""}
        className="max-w-full rounded my-2 cursor-pointer hover:opacity-90 transition-opacity"
        onClick={() => src && setExpandedImage({ src, alt: alt || "" })}
      />
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="list-disc pl-4 my-1.5 space-y-0.5">{children}</ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="list-decimal pl-4 my-1.5 space-y-0.5">{children}</ol>
    ),
    li: ({ children }: { children?: React.ReactNode }) => (
      <li>{children}</li>
    ),
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>
    ),
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote 
        className="border-l-2 pl-3 my-2"
        style={{ borderColor: theme.border.default, color: theme.text.secondary }}
      >
        {children}
      </blockquote>
    ),
  };

  const renderCommentBody = (body: string) => (
    <div
      className="text-[13px] leading-relaxed"
      style={{ color: theme.text.primary }}
    >
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={markdownComponents}
      >
        {body}
      </ReactMarkdown>
    </div>
  );

  const renderReviewEvent = (comment: PRComment, nestedThreads: PRComment[]) => {
    const hasBody = comment.body && comment.body.trim().length > 0;
    const hasThreads = nestedThreads.length > 0;
    const isCollapsed = comment.review_id ? collapsedReviews.has(comment.review_id) : false;
    
    let actionText = 'reviewed';
    let ActionIcon: typeof CheckCircle2 | typeof XCircle | null = null;
    let iconColor: string = theme.text.tertiary;
    
    if (comment.state === 'APPROVED') {
      actionText = 'approved';
      ActionIcon = CheckCircle2;
      iconColor = theme.semantic.success;
    } else if (comment.state === 'CHANGES_REQUESTED') {
      actionText = 'requested changes';
      ActionIcon = XCircle;
      iconColor = theme.semantic.error;
    }

    return (
      <div className="py-2.5">
        <div className="flex items-center gap-2">
          <Avatar name={comment.author} size="sm" />
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="text-[13px] font-medium" style={{ color: theme.text.primary }}>
              {comment.author}
            </span>
            <span className="text-[13px]" style={{ color: theme.text.tertiary }}>
              {actionText}
            </span>
            {ActionIcon && (
              <ActionIcon className="w-3.5 h-3.5 shrink-0" style={{ color: iconColor }} />
            )}
            <span className="text-[13px]" style={{ color: theme.text.muted }}>
              · {formatDate(comment.created_at)}
            </span>
          </div>
        </div>

        {hasBody && (
          <div className="mt-2 ml-7">
            {renderCommentBody(comment.body)}
          </div>
        )}

        {hasThreads && comment.review_id && (
          <div className="mt-2 ml-7">
            <button
              onClick={() => toggleReviewCollapse(comment.review_id!)}
              className="flex items-center gap-1.5 text-[12px] py-1 transition-colors"
              style={{ color: theme.text.secondary }}
              onMouseEnter={(e) => e.currentTarget.style.color = theme.text.primary}
              onMouseLeave={(e) => e.currentTarget.style.color = theme.text.secondary}
            >
              <ChevronDown 
                className={`w-3.5 h-3.5 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} 
              />
              <Code2 className="w-3.5 h-3.5" style={{ color: theme.text.tertiary }} />
              <span>{nestedThreads.length} code comment{nestedThreads.length !== 1 ? 's' : ''}</span>
            </button>
            
            {!isCollapsed && (
              <div 
                className="mt-2 rounded-lg overflow-hidden"
                style={{ background: theme.bg.secondary }}
              >
                {nestedThreads
                  .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                  .map((thread, idx) => (
                    <div 
                      key={idx}
                      className="px-3 py-2.5"
                      style={{ 
                        borderTop: idx > 0 ? `1px solid ${theme.border.subtle}` : undefined 
                      }}
                    >
                      {thread.path && (
                        <div 
                          className="flex items-center gap-1.5 mb-2 text-[11px] font-mono"
                          style={{ color: theme.text.tertiary }}
                        >
                          <span className="truncate">{thread.path}</span>
                          {thread.line && (
                            <span style={{ color: theme.text.muted }}>:{thread.line}</span>
                          )}
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <Avatar name={thread.author} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[12px] font-medium" style={{ color: theme.text.primary }}>
                              {thread.author}
                            </span>
                            <span className="text-[11px]" style={{ color: theme.text.muted }}>
                              {formatDate(thread.created_at)}
                            </span>
                          </div>
                          {renderCommentBody(thread.body)}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderComment = (comment: PRComment) => {
    const hasBody = comment.body && comment.body.trim().length > 0;

    return (
      <div 
        className="py-3 rounded-lg px-3"
        style={{ background: theme.bg.secondary }}
      >
        <div className="flex items-start gap-2.5">
          <Avatar name={comment.author} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[13px] font-medium" style={{ color: theme.text.primary }}>
                {comment.author}
              </span>
              <span className="text-[12px]" style={{ color: theme.text.muted }}>
                {formatDate(comment.created_at)}
              </span>
            </div>
            
            {comment.comment_type === 'review_thread' && comment.path && (
              <div 
                className="flex items-center gap-1.5 mb-2 text-[11px] font-mono"
                style={{ color: theme.text.tertiary }}
              >
                <Code2 className="w-3 h-3 shrink-0" />
                <span className="truncate">{comment.path}</span>
                {comment.line && (
                  <span style={{ color: theme.text.muted }}>:{comment.line}</span>
                )}
              </div>
            )}
            
            {hasBody && renderCommentBody(comment.body)}
          </div>
        </div>
      </div>
    );
  };

  if (comments.length === 0) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center gap-2 p-8"
        style={{ color: theme.text.tertiary }}
      >
        <MessageSquare className="w-8 h-8" style={{ color: theme.text.muted }} />
        <span className="text-sm">No comments yet</span>
      </div>
    );
  }

  return (
    <>
      {expandedImage && (
        <ImageModal
          src={expandedImage.src}
          alt={expandedImage.alt}
          onClose={() => setExpandedImage(null)}
        />
      )}
      <div className="flex flex-col h-full overflow-auto">
        <div className="px-3 py-2 space-y-1">
          {topLevelComments.map((comment, index) => {
            const nestedThreads = comment.comment_type === 'review' && comment.review_id 
              ? threadsByReviewId.get(comment.review_id) || []
              : [];
            
            if (comment.comment_type === 'review') {
              console.log('[CommentsTab] Rendering review:', {
                author: comment.author,
                review_id: comment.review_id,
                hasBody: !!(comment.body && comment.body.trim().length > 0),
                hasNestedThreads: nestedThreads.length > 0,
                nestedCount: nestedThreads.length
              });
            }
            
            return (
              <div key={index}>
                {comment.comment_type === 'review' 
                  ? renderReviewEvent(comment, nestedThreads)
                  : renderComment(comment)
                }
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
