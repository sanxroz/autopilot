import { describe, expect, test } from "bun:test";
import {
  getAgentSessionSection,
  getPrSessionSection,
} from "../src/lib/session-sections";
import type { AgentRunState } from "../src/types";
import type { PRStatus } from "../src/types/github";

const openPr: PRStatus = {
  number: 42,
  title: "Organize sessions",
  url: "https://example.com/pull/42",
  state: "open",
  merged: false,
  draft: false,
  review_decision: null,
  checks_status: "success",
  mergeable: "MERGEABLE",
  additions: 10,
  deletions: 2,
  head_branch: "session-sections",
  base_branch: "master",
  author: "user",
  created_at: "2026-08-03T00:00:00Z",
  updated_at: "2026-08-03T00:00:00Z",
  labels: [],
  requested_reviewers: [],
  has_unresolved_review_threads: false,
  is_bot: false,
};

const agentRun: AgentRunState = {
  worktreePath: "/repo/worktree",
  sessionId: "session-1",
  status: "running",
  startedAt: 1,
  lastEventAt: 1,
};

describe("session sections", () => {
  test("prioritizes pull requests by required action", () => {
    expect(getPrSessionSection(null)).toBe("pr:none");
    expect(getPrSessionSection(openPr)).toBe("pr:review");
    expect(
      getPrSessionSection({ ...openPr, checks_status: "failure" }),
    ).toBe("pr:attention");
    expect(
      getPrSessionSection({ ...openPr, mergeable: "CONFLICTING" }),
    ).toBe("pr:attention");
    expect(
      getPrSessionSection({ ...openPr, review_decision: "CHANGES_REQUESTED" }),
    ).toBe("pr:attention");
    expect(
      getPrSessionSection({ ...openPr, has_unresolved_review_threads: true }),
    ).toBe("pr:attention");
    expect(
      getPrSessionSection({ ...openPr, review_decision: "APPROVED" }),
    ).toBe("pr:ready");
    expect(
      getPrSessionSection({
        ...openPr,
        draft: true,
        review_decision: "APPROVED",
      }),
    ).toBe("pr:review");
    expect(
      getPrSessionSection({
        ...openPr,
        checks_status: "pending",
        review_decision: "APPROVED",
      }),
    ).toBe("pr:review");
    expect(
      getPrSessionSection({
        ...openPr,
        checks_status: null,
        review_decision: "APPROVED",
      }),
    ).toBe("pr:review");
    expect(getPrSessionSection({ ...openPr, merged: true })).toBe("pr:closed");
    expect(getPrSessionSection({ ...openPr, state: "closed" })).toBe("pr:closed");
  });

  test("surfaces agent runs that need attention", () => {
    expect(getAgentSessionSection("none", undefined)).toBe("agent:none");
    expect(getAgentSessionSection("agent_running", undefined)).toBe(
      "agent:running",
    );
    expect(getAgentSessionSection("none", agentRun)).toBe("agent:running");
    expect(
      getAgentSessionSection("none", { ...agentRun, status: "waiting_input" }),
    ).toBe("agent:attention");
    expect(
      getAgentSessionSection("none", { ...agentRun, status: "completed" }),
    ).toBe("agent:attention");
    expect(
      getAgentSessionSection("none", { ...agentRun, status: "error" }),
    ).toBe("agent:attention");
  });
});
