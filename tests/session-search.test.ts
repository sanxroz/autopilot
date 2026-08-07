import { describe, expect, test } from "bun:test";
import { getSessionSearchStatuses } from "../src/lib/session-search";
import type { AgentRunState } from "../src/types";
import type { PRStatus } from "../src/types/github";

const runningAgent: AgentRunState = {
  worktreePath: "/repo/worktree",
  sessionId: "session-1",
  status: "running",
  startedAt: 1,
  lastEventAt: 1,
};

const pullRequest: PRStatus = {
  number: 42,
  title: "Improve search",
  url: "https://example.com/pull/42",
  state: "open",
  merged: false,
  draft: false,
  review_decision: "APPROVED",
  checks_status: "success",
  mergeable: "MERGEABLE",
  additions: 10,
  deletions: 2,
  head_branch: "search-status",
  base_branch: "master",
  author: "user",
  created_at: "2026-08-03T00:00:00Z",
  updated_at: "2026-08-03T00:00:00Z",
  labels: [],
  requested_reviewers: [],
  has_unresolved_review_threads: false,
  is_bot: false,
};

describe("session search statuses", () => {
  test("surfaces live activity", () => {
    expect(getSessionSearchStatuses("none", runningAgent, undefined)[0]).toEqual({
      label: "Agent running",
      tone: "success",
    });
    expect(getSessionSearchStatuses("dev_server", undefined, undefined)[0]).toEqual({
      label: "Dev server",
      tone: "info",
    });
    expect(getSessionSearchStatuses("none", undefined, undefined)[0]).toEqual({
      label: "Idle",
      tone: "muted",
    });
  });

  test("prioritizes activity and includes pull request health", () => {
    expect(getSessionSearchStatuses("none", undefined, pullRequest)).toEqual([
      { label: "Idle", tone: "muted" },
      { label: "Ready to merge", tone: "success" },
    ]);
    expect(
      getSessionSearchStatuses("none", { ...runningAgent, status: "waiting_input" }, {
        ...pullRequest,
        checks_status: "failure",
      }),
    ).toEqual([
      { label: "Waiting for input", tone: "warning" },
      { label: "PR needs attention", tone: "error" },
    ]);
    expect(
      getSessionSearchStatuses("none", undefined, {
        ...pullRequest,
        checks_status: "pending",
      }),
    ).toEqual([
      { label: "Idle", tone: "muted" },
      { label: "Checks running", tone: "warning" },
    ]);
  });
});
