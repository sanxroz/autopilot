import { describe, expect, test } from "bun:test";
import {
  getCheckFailureCopyText,
  getChecksSummaryLabel,
} from "../src/components/RightPanel/checks-tab-domain";
import type { PRCheck, PRCheckDetail } from "../src/types/github";

describe("getCheckFailureCopyText", () => {
  test("includes check context, failed steps, logs, and the source URL", () => {
    const check: PRCheck = {
      name: "test",
      bucket: "fail",
      state: "completed",
      description: "Unit tests failed",
      workflow: "CI",
      event: "pull_request",
      url: "https://github.com/example/repo/actions/runs/1",
      started_at: null,
      completed_at: null,
      is_actions_job: true,
      job_id: 1,
    };
    const detail: PRCheckDetail = {
      steps: [{
        name: "Run tests",
        status: "completed",
        conclusion: "failure",
        number: 1,
        started_at: null,
        completed_at: null,
      }],
      failed_log_excerpt: "Expected 1, received 2",
    };

    expect(getCheckFailureCopyText(check, detail)).toBe(
      "Failed check: test\n\nWorkflow: CI\n\nUnit tests failed\n\nFailed steps:\n- Run tests: failure\n\nFailure output:\nExpected 1, received 2\n\nGitHub: https://github.com/example/repo/actions/runs/1",
    );
  });
});

describe("getChecksSummaryLabel", () => {
  test("explains non-passing checks instead of reporting an ambiguous fraction", () => {
    expect(getChecksSummaryLabel({
      total: 11,
      passing: 10,
      failing: 0,
      pending: 0,
      skipped: 1,
      cancelled: 0,
    })).toBe("10 passed · 1 skipped");
  });

  test("falls back to the total for unknown check buckets", () => {
    expect(getChecksSummaryLabel({
      total: 1,
      passing: 0,
      failing: 0,
      pending: 0,
      skipped: 0,
      cancelled: 0,
    })).toBe("1 total");
  });
});
