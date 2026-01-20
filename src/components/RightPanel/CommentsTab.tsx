import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, MessageSquare, Copy, Check, X, CheckCircle2, XCircle, MessageCircle, Code2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { useTheme } from "../../hooks/useTheme";
import type { PRDetailedInfo, PRStatus, PRComment } from "../../types/github";

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
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
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
      className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
      style={{ background: theme.bg.secondary }}
      title="Copy code"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5" style={{ color: "#22C55E" }} />
      ) : (
        <Copy className="w-3.5 h-3.5" style={{ color: theme.text.tertiary }} />
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
        className="max-w-[90vw] max-h-[90vh] object-contain rounded"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function CommentTypeBadge({ comment }: { comment: PRComment }) {
  const theme = useTheme();

  if (comment.comment_type === 'review') {
    const state = comment.state;
    if (state === 'APPROVED') {
      return (
        <span 
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium"
          style={{ 
            background: theme.semantic.successMuted, 
            color: theme.semantic.success 
          }}
        >
          <CheckCircle2 className="w-3 h-3" />
          Approved
        </span>
      );
    }
    if (state === 'CHANGES_REQUESTED') {
      return (
        <span 
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium"
          style={{ 
            background: theme.semantic.errorMuted, 
            color: theme.semantic.error 
          }}
        >
          <XCircle className="w-3 h-3" />
          Changes requested
        </span>
      );
    }
    return (
      <span 
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium"
        style={{ 
          background: theme.bg.tertiary, 
          color: theme.text.secondary 
        }}
      >
        <MessageCircle className="w-3 h-3" />
        Reviewed
      </span>
    );
  }

  if (comment.comment_type === 'review_thread') {
    return (
      <span 
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium"
        style={{ 
          background: theme.semantic.infoMuted, 
          color: theme.semantic.info 
        }}
      >
        <Code2 className="w-3 h-3" />
        Code comment
      </span>
    );
  }

  return null;
}

function FilePathBadge({ path, line }: { path?: string; line?: number }) {
  const theme = useTheme();
  
  if (!path) return null;
  
  const displayPath = path.length > 40 
    ? '...' + path.slice(-37) 
    : path;
  
  return (
    <div 
      className="flex items-center gap-2 mt-2 mb-1 px-2 py-1.5 rounded text-xs"
      style={{ 
        background: theme.bg.tertiary, 
        borderLeft: `2px solid ${theme.semantic.info}` 
      }}
    >
      <Code2 className="w-3.5 h-3.5 shrink-0" style={{ color: theme.text.tertiary }} />
      <code 
        className="font-mono truncate" 
        style={{ color: theme.text.secondary }}
        title={path}
      >
        {displayPath}
      </code>
      {line && (
        <span 
          className="shrink-0 px-1.5 py-0.5 rounded font-mono"
          style={{ 
            background: theme.bg.hover, 
            color: theme.text.tertiary 
          }}
        >
          L{line}
        </span>
      )}
    </div>
  );
}

export function CommentsTab({ repoPath, prNumber, prStatus }: CommentsTabProps) {
  const theme = useTheme();
  const [prDetails, setPrDetails] = useState<PRDetailedInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null);

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

  if (!prNumber) {
    return (
      <div
        className="flex-1 flex items-center justify-center text-sm"
        style={{ color: theme.text.secondary }}
      >
        No PR found for this branch
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="flex-1 flex items-center justify-center text-sm"
        style={{ color: theme.text.secondary }}
      >
        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center text-sm gap-2 p-4"
        style={{ color: theme.semantic.error }}
      >
        <span className="text-center">{error}</span>
        <button
          onClick={fetchData}
          className="px-3 py-1 rounded text-xs"
          style={{ background: theme.bg.tertiary, color: theme.text.primary }}
        >
          Retry
        </button>
      </div>
    );
  }

  const comments = prDetails?.comments || [];

  const threadsByReviewId = new Map<string, PRComment[]>();
  const topLevelComments: PRComment[] = [];
  
  for (const comment of comments) {
    if (comment.comment_type === 'review_thread' && comment.review_id) {
      const existing = threadsByReviewId.get(comment.review_id) || [];
      existing.push(comment);
      threadsByReviewId.set(comment.review_id, existing);
    } else {
      topLevelComments.push(comment);
    }
  }
  
  topLevelComments.sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const markdownComponents = {
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <a 
        href={href} 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-blue-400 hover:underline"
      >
        {children}
      </a>
    ),
    code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
      const isInline = !className;
      return isInline ? (
        <code 
          className="px-1 py-0.5 rounded text-xs"
          style={{ background: theme.bg.tertiary }}
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
            className="p-2 rounded text-xs overflow-x-auto"
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
        className="max-w-full rounded my-2 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => src && setExpandedImage({ src, alt: alt || "" })}
      />
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="list-disc pl-4 my-1">{children}</ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="list-decimal pl-4 my-1">{children}</ol>
    ),
    li: ({ children }: { children?: React.ReactNode }) => (
      <li className="my-0.5">{children}</li>
    ),
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="my-1">{children}</p>
    ),
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote 
        className="border-l-2 pl-2 my-1 italic"
        style={{ borderColor: theme.border.default, color: theme.text.tertiary }}
      >
        {children}
      </blockquote>
    ),
  };

  const renderCommentBody = (body: string) => (
    <div
      className="text-sm prose prose-sm prose-invert max-w-none"
      style={{ 
        color: theme.text.secondary,
        ['--tw-prose-body' as string]: theme.text.secondary,
        ['--tw-prose-headings' as string]: theme.text.primary,
        ['--tw-prose-links' as string]: '#3B82F6',
        ['--tw-prose-code' as string]: theme.text.primary,
        ['--tw-prose-pre-bg' as string]: theme.bg.tertiary,
      }}
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

  const renderNestedThreadComments = (threadComments: PRComment[]) => {
    const sorted = [...threadComments].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    
    return (
      <div 
        className="mt-3 pl-4"
        style={{ 
          borderLeft: `2px solid ${theme.border.default}80` 
        }}
      >
        {sorted.map((thread, idx) => (
          <div
            key={`thread-${idx}`}
            className="py-3 first:pt-0"
            style={{ 
              borderBottom: idx < sorted.length - 1 ? `1px solid ${theme.border.default}40` : 'none'
            }}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-sm font-medium"
                  style={{ color: theme.text.primary }}
                >
                  {thread.author}
                </span>
                <CommentTypeBadge comment={thread} />
              </div>
              <span
                className="text-xs shrink-0"
                style={{ color: theme.text.tertiary }}
              >
                {formatDate(thread.created_at)}
              </span>
            </div>
            
            <FilePathBadge path={thread.path} line={thread.line} />
            
            {renderCommentBody(thread.body)}
          </div>
        ))}
      </div>
    );
  };

  if (comments.length === 0) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center text-sm gap-2"
        style={{ color: theme.text.secondary }}
      >
        <MessageSquare className="w-8 h-8" style={{ color: theme.text.tertiary }} />
        No comments yet
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
        <div className="px-3 py-2">
          {topLevelComments.map((comment, index) => {
            const nestedThreads = comment.comment_type === 'review' && comment.review_id 
              ? threadsByReviewId.get(comment.review_id) || []
              : [];
            const hasBody = comment.body && comment.body.trim().length > 0;
            const hasNestedThreads = nestedThreads.length > 0;
            
            return (
              <div
                key={index}
                className="py-4 border-b last:border-b-0"
                style={{ borderColor: theme.border.default }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: theme.text.primary }}
                    >
                      {comment.author}
                    </span>
                    <CommentTypeBadge comment={comment} />
                  </div>
                  <span
                    className="text-xs shrink-0"
                    style={{ color: theme.text.tertiary }}
                  >
                    {formatDate(comment.created_at)}
                  </span>
                </div>
                
                {comment.comment_type === 'review_thread' && (
                  <FilePathBadge path={comment.path} line={comment.line} />
                )}
                
                {hasBody && renderCommentBody(comment.body)}
                
                {!hasBody && comment.comment_type === 'review' && hasNestedThreads && (
                  <span 
                    className="text-xs italic"
                    style={{ color: theme.text.tertiary }}
                  >
                    Left code comments
                  </span>
                )}
                
                {hasNestedThreads && renderNestedThreadComments(nestedThreads)}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
