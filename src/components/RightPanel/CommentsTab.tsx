import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader, MessageSquare, Copy, Check, X, CheckCircle2, Code2, ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { markdownComponents as sharedMarkdownComponents } from "../../lib/markdown-components";
import { useAppStore } from "../../store";
import { cn } from "../../utils/cn";
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
        "p-1.5 rounded transition-all duration-200 hover:scale-110 active:scale-95",
        "hover:bg-hover text-tertiary hover:text-primary",
        className
      )}
      title={title}
      aria-label={copied ? "Copied" : title}
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-semantic-success animate-in zoom-in duration-200" />
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

export function CommentsTab({ repoPath, prNumber, prStatus }: CommentsTabProps) {
  const getPRDataCache = useAppStore((state) => state.getPRDataCache);
  const setPRDataCache = useAppStore((state) => state.setPRDataCache);
  
  const [prDetails, setPrDetails] = useState<PRDetailedInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null);
  const lastPrStatusRef = useRef<PRStatus | null>(null);
  const initialFetchDoneRef = useRef(false);

  const fetchData = useCallback(async (isPolling = false) => {
    if (!repoPath || !prNumber) {
      setPrDetails(null);
      return;
    }

    if (!isPolling) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const details = await invoke<PRDetailedInfo>("get_pr_details", { repoPath, prNumber });
      setPrDetails(details);
      setPRDataCache(repoPath, prNumber, { prDetails: details });
      if (isPolling) {
        setError(null);
      }
    } catch (e) {
      if (!isPolling) {
        setError(String(e));
        setPrDetails(null);
      }
    } finally {
      if (!isPolling) {
        setIsLoading(false);
      }
    }
  }, [repoPath, prNumber, setPRDataCache]);

  useEffect(() => {
    if (!repoPath || !prNumber) return;
    
    const cached = getPRDataCache(repoPath, prNumber);
    if (cached?.prDetails) {
      setPrDetails(cached.prDetails);
      setError(null);
    } else {
      fetchData();
    }
    initialFetchDoneRef.current = true;
  }, [repoPath, prNumber, getPRDataCache, fetchData]);

  useEffect(() => {
    if (!prStatus) return;
    
    const prev = lastPrStatusRef.current;
    const hasChanged = !prev || 
      prStatus.checks_status !== prev.checks_status ||
      prStatus.review_decision !== prev.review_decision ||
      prStatus.state !== prev.state ||
      prStatus.merged !== prev.merged ||
      prStatus.draft !== prev.draft;
    
    if (hasChanged) {
      lastPrStatusRef.current = prStatus;
      // Only fetch if initial load has completed (prevents double fetch on mount)
      if (initialFetchDoneRef.current) {
        fetchData(true);
      }
    }
  }, [prStatus, fetchData]);

  const markdownComponents = {
    ...sharedMarkdownComponents,
    // Override: compact spacing for comment context
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>
    ),
    // Override: clickable images for comment context
    img: ({ src, alt }: { src?: string; alt?: string }) => (
      <img
        src={src}
        alt={alt || ""}
        className="max-w-full rounded my-2 cursor-pointer hover:opacity-90 transition-opacity"
        onClick={() => src && setExpandedImage({ src, alt: alt || "" })}
      />
    ),
    // Override: compact code blocks with copy button
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
          <pre className="p-3 rounded text-[13px] overflow-x-auto bg-tertiary">
            {children}
          </pre>
          <CopyButton text={codeContent} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100" />
        </div>
      );
    },
  };

  const renderCommentBody = (body: string) => (
    <div className="text-[13px] leading-relaxed text-primary">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
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

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 text-sm text-tertiary">
        <Loader className="w-4 h-4 animate-spin" />
        <span>Loading comments...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
        <span className="text-sm text-center text-tertiary">{error}</span>
        <button
          onClick={() => fetchData()}
          className="px-3 py-1.5 rounded text-xs font-medium transition-colors bg-tertiary text-secondary hover:bg-hover"
        >
          Try again
        </button>
      </div>
    );
  }

  const comments = prDetails?.comments || [];

  const reviews = comments.filter(c => c.comment_type === 'review' && (c.state === 'APPROVED' || c.state === 'CHANGES_REQUESTED'));
  const threadComments = comments.filter(c => c.comment_type === 'review_thread');
  
  const commentsByFile = new Map<string, PRComment[]>();
  for (const comment of threadComments) {
    const path = comment.path || 'General';
    const existing = commentsByFile.get(path) || [];
    existing.push(comment);
    commentsByFile.set(path, existing);
  }

  const sortedFiles = Array.from(commentsByFile.keys()).sort();

  const handleCopyAll = async () => {
    let allText = "";
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
      <div className="flex flex-col h-full overflow-auto bg-primary">
        {(reviews.length > 0 || sortedFiles.length > 0) && (
            <div className="p-2 border-b border-border bg-primary flex justify-end sticky top-0 z-20 backdrop-blur-md">
                <button 
                    onClick={handleCopyAll}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-tertiary text-secondary hover:bg-hover hover:scale-105 active:scale-95 transition-all duration-200"
                >
                    <Copy className="w-3 h-3" />
                    Copy All Comments
                </button>
            </div>
        )}

        {reviews.length > 0 && (
           <div className="border-b border-border bg-secondary/30">
             {reviews.map((review, idx) => (
               <div key={idx} className="px-4 py-3 border-b border-border last:border-0 flex items-start gap-3 group relative">
                 <Avatar name={review.author} />
                 <div className="flex-1 min-w-0">
                   <div className="flex items-center gap-2 mb-1">
                     <span className="text-sm font-semibold text-primary">{review.author}</span>
                     <span className={cn(
                       "text-xs font-medium px-2 py-0.5 rounded-full border",
                       review.state === 'APPROVED' 
                         ? "bg-semantic-success/10 text-semantic-success border-semantic-success/20"
                         : "bg-semantic-error/10 text-semantic-error border-semantic-error/20"
                     )}>
                       {review.state === 'APPROVED' ? 'Approved' : 'Requested Changes'}
                     </span>
                     <span className="text-xs text-tertiary">{formatDate(review.created_at)}</span>
                     <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                        <CopyButton text={`Review by ${review.author} (${review.state}):\n${review.body}`} className="bg-transparent hover:bg-hover" title="Copy review" />
                     </div>
                   </div>
                   {review.body && (
                     <div className="text-sm text-secondary mt-2">
                       {renderCommentBody(review.body)}
                     </div>
                   )}
                 </div>
               </div>
             ))}
           </div>
        )}

        <div className="divide-y divide-border">
          {sortedFiles.map(filePath => {
            const fileComments = commentsByFile.get(filePath) || [];
            fileComments.sort((a, b) => (a.line || 0) - (b.line || 0));

            return (
              <div key={filePath} className="bg-primary group/file">
                <div className="px-4 py-2 bg-secondary border-b border-border flex items-center gap-2 sticky top-[40px] z-10 backdrop-blur-sm justify-between">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Code2 className="w-4 h-4 text-tertiary shrink-0" />
                    <span className="text-xs font-medium text-secondary font-mono truncate" title={filePath}>{filePath}</span>
                  </div>
                  <button 
                    onClick={() => handleCopyFileComments(filePath, fileComments)}
                    className="p-1.5 rounded hover:bg-hover hover:scale-110 active:scale-95 text-tertiary opacity-0 group-hover/file:opacity-100 transition-all duration-200"
                    title="Copy file comments"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                
                <div className="divide-y divide-border/50">
                  {fileComments.map((comment, idx) => (
                    <CommentRow 
                        key={idx} 
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
          
          {sortedFiles.length === 0 && reviews.length === 0 && (
             <div className="flex flex-col items-center justify-center py-12 text-tertiary">
               <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
               <p className="text-sm">No review comments</p>
             </div>
          )}
        </div>
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

    if (isResolved && !isExpanded) {
        return (
            <div 
                className="px-4 py-2 flex items-center gap-3 cursor-pointer hover:bg-hover/50 transition-colors group"
                onClick={() => setIsExpanded(true)}
            >
                <div className="w-6 flex justify-center">
                    <CheckCircle2 className="w-4 h-4 text-tertiary" />
                </div>
                <div className="flex-1 flex items-center gap-2 overflow-hidden">
                    <span className="text-xs text-tertiary font-medium">Resolved comment by {comment.author}</span>
                    <span className="text-xs text-muted truncate">{comment.body.substring(0, 50)}...</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <CopyButton text={comment.body} className="bg-transparent hover:bg-hover p-1" title="Copy comment" />
                    </div>
                    <ChevronDown className="w-4 h-4 text-tertiary -rotate-90" />
                </div>
            </div>
        );
    }

    return (
        <div className={cn("px-4 py-3 hover:bg-hover/20 transition-colors group/comment relative", isResolved && "bg-secondary/10")}>
            <div className="flex items-start gap-3">
                <Avatar name={comment.author} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-primary">{comment.author}</span>
                        <span className="text-xs text-tertiary">{formatDate(comment.created_at)}</span>
                        <div className="ml-auto flex items-center gap-2">
                            {comment.line && (
                                <span className="text-[10px] bg-tertiary px-1.5 py-0.5 rounded text-secondary font-mono">
                                    Line {comment.line}
                                </span>
                            )}
                            {isResolved && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
                                    className="text-tertiary hover:text-primary p-1 hover:scale-110 active:scale-95 transition-transform"
                                    title="Collapse resolved"
                                >
                                    <CheckCircle2 className="w-4 h-4 text-semantic-success" />
                                </button>
                            )}
                            <div className="opacity-0 group-hover/comment:opacity-100 transition-opacity">
                                <CopyButton text={comment.body} className="bg-transparent hover:bg-hover p-1" title="Copy comment" />
                            </div>
                        </div>
                    </div>
                    <div className="text-sm text-secondary">
                        {renderBody(comment.body)}
                    </div>
                </div>
            </div>
        </div>
    );
}