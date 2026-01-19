import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, MessageSquare, Copy, Check, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { useTheme } from "../../hooks/useTheme";
import type { PRDetailedInfo } from "../../types/github";

interface CommentsTabProps {
  repoPath: string | null;
  prNumber: number | null;
  onRefreshReady?: (refresh: () => void) => void;
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

export function CommentsTab({ repoPath, prNumber, onRefreshReady }: CommentsTabProps) {
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
    if (onRefreshReady) {
      onRefreshReady(() => fetchData);
    }
  }, [onRefreshReady, fetchData]);

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
          {comments.map((comment, index) => (
          <div
            key={index}
            className="py-3 border-b last:border-b-0"
            style={{ borderColor: theme.border.subtle }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-xs font-medium"
                style={{ color: theme.text.primary }}
              >
                {comment.author}
              </span>
              <span
                className="text-xs"
                style={{ color: theme.text.tertiary }}
              >
                {formatDate(comment.created_at)}
              </span>
            </div>
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
                components={{
                  a: ({ href, children }) => (
                    <a 
                      href={href} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      {children}
                    </a>
                  ),
                  code: ({ className, children, ...props }) => {
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
                  pre: ({ children }) => {
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
                  img: ({ src, alt }) => (
                    <img
                      src={src}
                      alt={alt || ""}
                      className="max-w-full rounded my-2 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => src && setExpandedImage({ src, alt: alt || "" })}
                    />
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc pl-4 my-1">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal pl-4 my-1">{children}</ol>
                  ),
                  li: ({ children }) => (
                    <li className="my-0.5">{children}</li>
                  ),
                  p: ({ children }) => (
                    <p className="my-1">{children}</p>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote 
                      className="border-l-2 pl-2 my-1 italic"
                      style={{ borderColor: theme.border.default, color: theme.text.tertiary }}
                    >
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {comment.body}
              </ReactMarkdown>
            </div>
          </div>
        ))}
        </div>
      </div>
    </>
  );
}
