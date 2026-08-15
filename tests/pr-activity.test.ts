import { describe, expect, test } from "bun:test";
import { groupReviewThreads } from "../src/components/RightPanel/pr-activity";
import type { PRComment } from "../src/types/github";

const comment = (overrides: Partial<PRComment>): PRComment => ({
  author: "reviewer",
  body: "Comment",
  created_at: "2026-08-15T12:00:00Z",
  comment_type: "review_thread",
  path: "src/app.ts",
  line: 12,
  is_resolved: false,
  ...overrides,
});

describe("groupReviewThreads", () => {
  test("keeps replies together and orders them chronologically", () => {
    const threads = groupReviewThreads([
      comment({ thread_id: "thread-1", body: "Reply", created_at: "2026-08-15T12:01:00Z" }),
      comment({ thread_id: "thread-1", body: "Root" }),
      comment({ thread_id: "thread-2", body: "Other", line: 30 }),
    ]);

    expect(threads).toHaveLength(2);
    expect(threads[0].comments.map(({ body }) => body)).toEqual(["Root", "Reply"]);
    expect(threads[1].line).toBe(30);
  });

  test("falls back to file and line for cached comments without a thread id", () => {
    expect(groupReviewThreads([
      comment({ body: "Root" }),
      comment({ body: "Reply", author: "author" }),
    ])).toHaveLength(1);
  });
});
