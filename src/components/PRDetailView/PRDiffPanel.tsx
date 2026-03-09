import { useMemo, useRef, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
  ChevronLeft,
  ChevronRight,
  FileCode,
  Loader,
} from 'lucide-react';
import { DiffView, DiffModeEnum, DiffFile } from '@git-diff-view/react';
import '@git-diff-view/react/styles/diff-view.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { cn } from '../../utils/cn';
import { markdownComponents } from '../../lib/markdown-components';
import { getDiffHighlighter, type DiffHighlighter } from '../../lib/diff-highlighter';
import { DiffErrorBoundary, getLangFromPath } from '../DiffFileList';
import type { PRFile, PRComment } from '../../types/github';

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

function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
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

/* ── Time formatting ───────────────────────────────────────────────── */

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ── Diff parsing helpers ──────────────────────────────────────────── */

function extractFileDiff(fullDiff: string, filePath: string): string | null {
  const lines = fullDiff.split('\n');
  let capture = false;
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('diff --git')) {
      if (capture) break; // finished capturing previous file
      // Check if this diff block is for our file
      if (line.includes(`a/${filePath}`) || line.includes(`b/${filePath}`)) {
        capture = true;
      }
    }

    if (capture) {
      result.push(line);
    }
  }

  return result.length > 0 ? result.join('\n') : null;
}

/* ── Inline comment block ──────────────────────────────────────────── */

function InlineComment({ comment, isPending = false }: { comment: PRComment; isPending?: boolean }) {
  return (
    <div className="border-t border-border-subtle bg-[#111111] px-4 py-3 shadow-inner">
      <div className="flex items-start gap-2.5">
        <Avatar name={comment.author} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white">{comment.author}</span>
            {comment.state && (comment.state === 'APPROVED' || comment.state === 'CHANGES_REQUESTED') && (
              <span
                className={cn(
                  'rounded-full border px-1.5 py-0.5 text-2xs font-medium',
                  comment.state === 'APPROVED'
                    ? 'border-semantic-success/20 bg-semantic-success/10 text-semantic-success'
                    : 'border-semantic-error/20 bg-semantic-error/10 text-semantic-error'
                )}
              >
                {comment.state === 'APPROVED' ? 'Approved' : 'Changes Requested'}
              </span>
            )}
            {isPending ? (
              <span className="rounded-full border border-semantic-warning/20 bg-semantic-warning/10 px-1.5 py-0.5 text-2xs font-medium text-semantic-warning">
                Pending
              </span>
            ) : (
              <span className="text-2xs text-[#A3A3A3]">{formatDate(comment.created_at)}</span>
            )}
            {comment.line && (
              <span className="rounded bg-[#262626] px-1.5 py-0.5 font-mono text-2xs text-[#D4D4D4]">
                L{comment.line}
              </span>
            )}
          </div>
          <div className="pr-inline-comment-body mt-1 text-xs leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw, rehypeSanitize]}
              components={{
                ...markdownComponents,
                p: ({ children }) => <p className="my-1 first:mt-0 last:mb-0 text-[#D4D4D4]">{children}</p>,
              }}
            >
              {comment.body.replace(/<!--[\s\S]*?-->/g, '')}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Inline comment form (rendered via widget system) ──────────────── */

function InlineCommentForm({
  lineNumber,
  isPosting,
  pendingCount,
  currentUser,
  onCancel,
  onSubmitComment,
  onAddPendingComment,
}: {
  lineNumber: number;
  isPosting: boolean;
  pendingCount: number;
  currentUser: string;
  onCancel: () => void;
  onSubmitComment: (body: string) => Promise<boolean>;
  onAddPendingComment: (body: string) => void;
}) {
  const [text, setText] = useState('');

  const handleSubmit = async () => {
    const success = await onSubmitComment(text);
    if (success) setText('');
  };

  return (
    <div className="border-t border-[#30363d] bg-[#0d1117] px-4 py-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start gap-2.5">
        <Avatar name={currentUser} />
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-medium text-[#e6edf3]">{currentUser}</span>
            <span className="rounded bg-[#1c2128] px-1.5 py-0.5 font-mono text-2xs text-[#848d97]">L{lineNumber}</span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a comment..."
            rows={3}
            className="w-full resize-y rounded-md border border-[#30363d] bg-[#161b22] px-2.5 py-2 text-xs text-[#e6edf3] placeholder:text-[#484f58] focus:outline-none focus:border-[#1f6feb] focus:ring-1 focus:ring-[#1f6feb]"
            autoFocus
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              onClick={onCancel}
              className="rounded-md px-3 py-1 text-xs text-[#848d97] transition-colors hover:text-[#e6edf3]"
            >
              Cancel
            </button>
            <button
              onClick={() => onAddPendingComment(text)}
              disabled={!text.trim()}
              className="rounded-md border border-[#30363d] bg-[#21262d] px-3 py-1 text-xs font-medium text-[#c9d1d9] transition-colors hover:border-[#8b949e] hover:bg-[#30363d] disabled:opacity-40"
            >
              {pendingCount > 0 ? 'Add review comment' : 'Start a review'}
            </button>
            <button
              onClick={() => void handleSubmit()}
              disabled={!text.trim() || isPosting}
              className="rounded-md bg-[#238636] px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-[#2ea043] disabled:opacity-40"
            >
              {isPosting ? <Loader className="inline size-3 animate-spin" /> : 'Comment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── PRDiffPanel (main export) ─────────────────────────────────────── */

interface PRDiffPanelProps {
  files: PRFile[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  fullDiff: string | null;
  isDiffLoading: boolean;
  comments: PRComment[];
  isLightMode: boolean;
  repoPath: string;
  prNumber: number;
  onCommentAdded: () => void;
  pendingReviewComments: PendingReviewComment[];
  onPendingReviewCommentsChange: (comments: PendingReviewComment[]) => void;
  currentUser: string;
}

export function PRDiffPanel({
  files,
  selectedFile,
  onSelectFile,
  fullDiff,
  isDiffLoading,
  comments,
  isLightMode,
  repoPath,
  prNumber,
  onCommentAdded,
  pendingReviewComments,
  onPendingReviewCommentsChange,
  currentUser,
}: PRDiffPanelProps) {
  const diffFileRef = useRef<DiffFile | null>(null);
  const [shikiHighlighter, setShikiHighlighter] = useState<Omit<
    DiffHighlighter,
    'getHighlighterEngine'
  > | null>(null);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [optimisticComments, setOptimisticComments] = useState<PRComment[]>([]);

  // Load syntax highlighter
  useEffect(() => {
    let cancelled = false;
    getDiffHighlighter()
      .then((highlighter) => {
        if (!cancelled) setShikiHighlighter(highlighter);
      })
      .catch((err) => {
        console.error('Failed to load diff highlighter:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Extract patch for selected file
  const patch = useMemo(() => {
    if (!fullDiff || !selectedFile) return null;
    return extractFileDiff(fullDiff, selectedFile);
  }, [fullDiff, selectedFile]);

  // Build DiffFile instance
  const diffFile = useMemo(() => {
    if (!patch || !selectedFile) return null;

    const lang = getLangFromPath(selectedFile);
    try {
      const instance = DiffFile.createInstance({
        oldFile: { fileName: selectedFile, fileLang: lang, content: null },
        newFile: { fileName: selectedFile, fileLang: lang, content: null },
        hunks: [patch],
      });

      instance.initTheme(isLightMode ? 'light' : 'dark');
      instance.init();
      instance.buildUnifiedDiffLines();

      diffFileRef.current = instance;
      return instance;
    } catch (e) {
      console.error('Failed to create diff instance:', e);
      return null;
    }
  }, [patch, selectedFile, isLightMode]);

  // Cleanup diff instance
  useEffect(() => {
    return () => {
      if (diffFileRef.current) {
        diffFileRef.current.clear();
        diffFileRef.current = null;
      }
    };
  }, []);

  // File navigation
  const currentIndex = selectedFile ? files.findIndex((f) => f.path === selectedFile) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < files.length - 1;

  const goToPrev = () => {
    if (hasPrev) onSelectFile(files[currentIndex - 1].path);
  };
  const goToNext = () => {
    if (hasNext) onSelectFile(files[currentIndex + 1].path);
  };

  useEffect(() => {
    setOptimisticComments((prev) =>
      prev.filter(
        (optimisticComment) =>
          !comments.some(
            (serverComment) =>
              serverComment.path === optimisticComment.path &&
              serverComment.line === optimisticComment.line &&
              serverComment.body.trim() === optimisticComment.body.trim()
          )
      )
    );
  }, [comments]);

  const allComments = useMemo(() => {
    return [...comments, ...optimisticComments];
  }, [comments, optimisticComments]);

  // Get comments for current file
  const fileComments = useMemo(() => {
    if (!selectedFile) return [];
    return allComments.filter((c) => c.path === selectedFile);
  }, [allComments, selectedFile]);

  const fileCommentsWithoutLine = useMemo(() => {
    return fileComments.filter((c) => !c.line);
  }, [fileComments]);

  const submitInlineComment = async (body: string, lineNumber: number): Promise<boolean> => {
    if (!selectedFile || !body.trim()) return false;

    setIsPostingComment(true);
    try {
      await invoke<boolean>('create_pr_review_comment', {
        repoPath,
        prNumber,
        body: body.trim(),
        path: selectedFile,
        line: lineNumber,
      });
      toast.success('Inline comment added');
      setOptimisticComments((prev) => [
        ...prev,
        {
          author: currentUser,
          body: body.trim(),
          created_at: new Date().toISOString(),
          comment_type: 'review_thread',
          state: 'COMMENTED',
          path: selectedFile,
          line: lineNumber,
        },
      ]);
      onCommentAdded();
      return true;
    } catch (error) {
      toast.error(`Failed to add inline comment: ${String(error)}`);
      return false;
    } finally {
      setIsPostingComment(false);
    }
  };

  const addPendingReviewComment = (body: string, lineNumber: number, onDone: () => void) => {
    if (!selectedFile || !body.trim()) return;

    onPendingReviewCommentsChange([
      ...pendingReviewComments,
      {
        path: selectedFile,
        line: lineNumber,
        body: body.trim(),
      },
    ]);

    onDone();
  };


  // Group line comments for inline display
  const extendData = useMemo(() => {
    const fileExt: Record<string, { data: { comments?: PRComment[]; pendingComments?: PRComment[] } }> = {};
    for (const comment of fileComments) {
      if (comment.line) {
        if (!fileExt[comment.line]) fileExt[comment.line] = { data: {} };
        if (!fileExt[comment.line].data.comments) {
          fileExt[comment.line].data.comments = [];
        }
        fileExt[comment.line].data.comments?.push(comment);
      }
    }

    for (const pendingComment of pendingReviewComments) {
      if (pendingComment.path !== selectedFile) continue;
      if (!fileExt[pendingComment.line]) fileExt[pendingComment.line] = { data: {} };
      if (!fileExt[pendingComment.line].data.pendingComments) {
        fileExt[pendingComment.line].data.pendingComments = [];
      }
      fileExt[pendingComment.line].data.pendingComments?.push({
        author: currentUser,
        body: pendingComment.body,
        created_at: new Date().toISOString(),
        comment_type: 'review_thread',
        state: 'COMMENTED',
        path: pendingComment.path,
        line: pendingComment.line,
      });
    }

    // Provide data on both sides so context lines (which have both old+new line numbers) are matched
    return { newFile: fileExt, oldFile: {} };
  }, [currentUser, fileComments, pendingReviewComments, selectedFile]);
  // Current file stats
  const currentFile = selectedFile ? files.find((f) => f.path === selectedFile) : null;

  if (!selectedFile) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
        <FileCode className="size-8 opacity-40" />
        <p className="text-sm">Select a file to view changes</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* File header bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={goToPrev}
            disabled={!hasPrev}
            className="rounded p-1 text-tertiary hover:bg-hover hover:text-primary disabled:opacity-30"
            aria-label="Previous file"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            onClick={goToNext}
            disabled={!hasNext}
            className="rounded p-1 text-tertiary hover:bg-hover hover:text-primary disabled:opacity-30"
            aria-label="Next file"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>

        <span className="min-w-0 flex-1 truncate font-mono text-xs text-primary">
          {selectedFile}
        </span>

        {currentFile && (
          <span className="shrink-0 font-mono text-2xs tabular-nums">
            {currentFile.additions > 0 && (
              <span className="mr-1.5 text-semantic-success">+{currentFile.additions}</span>
            )}
            {currentFile.deletions > 0 && (
              <span className="text-semantic-error">-{currentFile.deletions}</span>
            )}
          </span>
        )}

        <span className="text-2xs text-muted">
          {currentIndex + 1}/{files.length}
        </span>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto">
        {isDiffLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-tertiary">
            <Loader className="size-4 animate-spin" />
            <span className="text-sm">Loading diff…</span>
          </div>
        ) : diffFile ? (
          <div className="agent-diff-wrapper">
            <style>{`
              .agent-diff-wrapper .diff-style-root {
                --diff-add-widget--: transparent;
                --diff-add-widget-color--: #6b7280;
              }
              .agent-diff-wrapper .diff-add-widget-wrapper {
                background: transparent !important;
              }
              .agent-diff-wrapper .diff-add-widget-wrapper:hover {
                transform: translateX(-50%) !important;
              }
              .agent-diff-wrapper .diff-line-old-content .diff-add-widget-wrapper:hover,
              .agent-diff-wrapper .diff-line-new-content .diff-add-widget-wrapper:hover {
                transform: translateX(50%) !important;
              }
              .agent-diff-wrapper .diff-widget-tooltip {
                color: #6b7280;
              }
              .agent-diff-wrapper .diff-widget-tooltip:hover {
                background-color: transparent;
                color: #d1d5db;
              }
              .agent-diff-wrapper .diff-widget-tooltip:hover::before,
              .agent-diff-wrapper .diff-widget-tooltip:hover::after {
                display: none;
              }
            `}</style>
            <DiffErrorBoundary fileName={selectedFile}>
              <DiffView
                diffFile={diffFile}
                diffViewMode={DiffModeEnum.Unified}
                diffViewWrap={false}
                diffViewTheme={isLightMode ? 'light' : 'dark'}
                diffViewHighlight={!!shikiHighlighter}
                registerHighlighter={shikiHighlighter as Parameters<typeof DiffView>[0]['registerHighlighter']}
                extendData={extendData}
                diffViewAddWidget
                onAddWidgetClick={() => { /* widget form renders via renderWidgetLine */ }}
                renderWidgetLine={({ lineNumber, onClose }) => (
                  <InlineCommentForm
                    lineNumber={lineNumber}
                    isPosting={isPostingComment}
                    pendingCount={pendingReviewComments.length}
                    currentUser={currentUser}
                    onCancel={onClose}
                    onSubmitComment={(body) => submitInlineComment(body, lineNumber)}
                    onAddPendingComment={(body) => addPendingReviewComment(body, lineNumber, onClose)}
                  />
                )}
                renderExtendLine={({ data }) => {
                  const lineComments = data?.comments as PRComment[];
                  const pendingLineComments = data?.pendingComments as PRComment[];
                  if (!lineComments?.length && !pendingLineComments?.length) return null;
                  return (
                    <div className="flex flex-col border-y border-border-subtle bg-primary">
                      {lineComments?.map((comment, idx) => (
                        <InlineComment key={`${comment.author}-${comment.created_at}-${idx}`} comment={comment} />
                      ))}
                      {pendingLineComments?.map((comment, idx) => (
                        <InlineComment key={`pending-${comment.line}-${comment.body}-${idx}`} comment={comment} isPending />
                      ))}
                    </div>
                  );
                }}
              />
            </DiffErrorBoundary>
          </div>
        ) : patch === null ? (
          <div className="px-4 py-12 text-center text-sm text-muted">
            No diff available for this file
          </div>
        ) : null}

        {/* Global/File-level comments (no line number) */}
        {fileCommentsWithoutLine.length > 0 && (
          <div className="border-t border-border-subtle">
            <div className="bg-secondary/30 px-4 py-1.5">
              <span className="text-2xs font-medium text-secondary">
                {fileCommentsWithoutLine.length} file-level comment{fileCommentsWithoutLine.length !== 1 ? 's' : ''}
              </span>
            </div>
            {fileCommentsWithoutLine.map((comment, idx) => (
              <InlineComment key={`${comment.author}-${comment.created_at}-${idx}`} comment={comment} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
