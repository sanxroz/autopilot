import type { PRComment } from "../../types/github";

export interface PRReviewThread {
  id: string;
  comments: PRComment[];
  path: string;
  line?: number;
  isResolved: boolean;
  createdAt: string;
}

export function groupReviewThreads(comments: readonly PRComment[]): PRReviewThread[] {
  const threads = new Map<string, PRReviewThread>();

  for (const comment of comments) {
    const id = comment.thread_id ?? `${comment.path ?? "General"}:${comment.line ?? 0}`;
    const thread = threads.get(id);
    if (thread) {
      thread.comments.push(comment);
      thread.isResolved = thread.isResolved || Boolean(comment.is_resolved);
      continue;
    }

    threads.set(id, {
      id,
      comments: [comment],
      path: comment.path ?? "General",
      line: comment.line,
      isResolved: Boolean(comment.is_resolved),
      createdAt: comment.created_at,
    });
  }

  return [...threads.values()].map((thread) => ({
    ...thread,
    comments: [...thread.comments].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));
}
